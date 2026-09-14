use std::ffi::{c_void, CStr, CString};

use libmpv_sys::*;
use serde_json::Value;

pub(crate) const DIAGNOSTIC_PROPERTIES: [&str; 13] = [
    "hwdec-current",
    "video-params",
    "audio-params",
    "demuxer-cache-duration",
    "cache-buffering-state",
    "cache-speed",
    "video-bitrate",
    "audio-bitrate",
    "estimated-vf-fps",
    "avsync",
    "total-avsync-change",
    "frame-drop-count",
    "decoder-frame-drop-count",
];

pub(crate) fn build_diagnostic_sample(
    properties: impl IntoIterator<Item = (&'static str, Option<Value>)>,
) -> Value {
    Value::Object(
        properties
            .into_iter()
            .filter_map(|(name, value)| value.map(|value| (name.to_string(), value)))
            .collect(),
    )
}

pub(crate) fn sanitize_mpv_log_text(text: &str) -> String {
    let trimmed = text.trim();
    let contains_location = trimmed.contains("://")
        || trimmed.to_ascii_lowercase().contains("file:")
        || trimmed.contains("\\\\")
        || trimmed.as_bytes().windows(3).any(|window| {
            window[0].is_ascii_alphabetic()
                && window[1] == b':'
                && (window[2] == b'\\' || window[2] == b'/')
        })
        || trimmed.split_whitespace().any(|token| {
            token
                .trim_matches(|character: char| "()[]{}<>,;:'\"".contains(character))
                .starts_with('/')
        })
        || ["authorization", "cookie", "http-header-fields"]
            .iter()
            .any(|secret| trimmed.to_ascii_lowercase().contains(secret));
    if contains_location {
        "[media location omitted]".to_string()
    } else {
        trimmed.chars().take(500).collect()
    }
}

pub(crate) unsafe fn get_mpv_node_property(mpv: *mut mpv_handle, property: &str) -> Option<Value> {
    let c_property = CString::new(property).ok()?;
    let mut node: mpv_node = std::mem::zeroed();
    let result = mpv_get_property(
        mpv,
        c_property.as_ptr(),
        mpv_format_MPV_FORMAT_NODE,
        (&mut node as *mut mpv_node).cast::<c_void>(),
    );
    if result < 0 {
        return None;
    }
    let value = node_to_json(&node);
    mpv_free_node_contents(&mut node);
    Some(value)
}

pub(crate) unsafe fn collect_diagnostic_sample(mpv: *mut mpv_handle) -> Value {
    build_diagnostic_sample(
        DIAGNOSTIC_PROPERTIES
            .iter()
            .map(|property| (*property, get_mpv_node_property(mpv, property))),
    )
}

pub(crate) unsafe fn node_to_json(node: *const mpv_node) -> Value {
    if node.is_null() {
        return Value::Null;
    }
    match (*node).format {
        libmpv_sys::mpv_format_MPV_FORMAT_STRING => {
            if (*node).u.string.is_null() {
                Value::Null
            } else {
                Value::String(
                    CStr::from_ptr((*node).u.string)
                        .to_string_lossy()
                        .into_owned(),
                )
            }
        }
        libmpv_sys::mpv_format_MPV_FORMAT_FLAG => Value::Bool((*node).u.flag != 0),
        libmpv_sys::mpv_format_MPV_FORMAT_INT64 => {
            Value::Number(serde_json::Number::from((*node).u.int64))
        }
        libmpv_sys::mpv_format_MPV_FORMAT_DOUBLE => serde_json::Number::from_f64((*node).u.double_)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        libmpv_sys::mpv_format_MPV_FORMAT_NODE_ARRAY => {
            let list = (*node).u.list;
            if list.is_null() {
                return Value::Array(vec![]);
            }
            Value::Array(
                (0..(*list).num)
                    .map(|index| node_to_json((*list).values.add(index as usize)))
                    .collect(),
            )
        }
        libmpv_sys::mpv_format_MPV_FORMAT_NODE_MAP => {
            let list = (*node).u.list;
            if list.is_null() || (*list).keys.is_null() || (*list).values.is_null() {
                return Value::Object(serde_json::Map::new());
            }
            let mut map = serde_json::Map::new();
            for index in 0..(*list).num {
                let key_ptr = *((*list).keys.add(index as usize));
                if !key_ptr.is_null() {
                    let key = CStr::from_ptr(key_ptr).to_string_lossy().into_owned();
                    map.insert(key, node_to_json((*list).values.add(index as usize)));
                }
            }
            Value::Object(map)
        }
        _ => Value::Null,
    }
}
