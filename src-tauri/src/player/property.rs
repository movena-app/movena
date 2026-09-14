use serde::Deserialize;
use serde_json::Value;
#[derive(Deserialize)]
pub struct MpvPropertyUpdate {
    property: String,
    value: Value,
}

fn numeric_property_value(value: &Value, minimum: f64, maximum: f64) -> Result<String, String> {
    let number = value
        .as_f64()
        .filter(|number| number.is_finite() && *number >= minimum && *number <= maximum)
        .ok_or_else(|| "The mpv property value is invalid".to_string())?;
    Ok(number.to_string())
}

fn string_property_value(value: &Value) -> Result<&str, String> {
    value
        .as_str()
        .ok_or_else(|| "The mpv property value is invalid".to_string())
}

pub(crate) fn validate_mpv_property(
    update: &MpvPropertyUpdate,
) -> Result<(&'static str, String), String> {
    let property = update.property.as_str();
    let invalid = || Err("The mpv property value is invalid".to_string());
    match property {
        "video-aspect-override" => {
            let value = string_property_value(&update.value)?;
            if ["-2", "16:9", "4:3", "1:1", "5:4"].contains(&value) {
                Ok(("video-aspect-override", value.to_string()))
            } else {
                invalid()
            }
        }
        "keepaspect" | "video-unscaled" => {
            let value = string_property_value(&update.value)?;
            if ["yes", "no"].contains(&value) {
                Ok((
                    if property == "keepaspect" {
                        "keepaspect"
                    } else {
                        "video-unscaled"
                    },
                    value.to_string(),
                ))
            } else {
                invalid()
            }
        }
        "panscan" => {
            let value = string_property_value(&update.value)?;
            if ["0", "1"].contains(&value) {
                Ok(("panscan", value.to_string()))
            } else {
                invalid()
            }
        }
        "video-crop" => {
            let value = string_property_value(&update.value)?;
            if ["", "50%x100%+0+0"].contains(&value) {
                Ok(("video-crop", value.to_string()))
            } else {
                invalid()
            }
        }
        "brightness" | "contrast" | "saturation" | "hue" | "gamma" => Ok((
            match property {
                "brightness" => "brightness",
                "contrast" => "contrast",
                "saturation" => "saturation",
                "hue" => "hue",
                _ => "gamma",
            },
            numeric_property_value(&update.value, -100.0, 100.0)?,
        )),
        "scale-blur" | "cscale-blur" => Ok((
            if property == "scale-blur" {
                "scale-blur"
            } else {
                "cscale-blur"
            },
            numeric_property_value(&update.value, -0.9, 0.0)?,
        )),
        "audio-delay" => Ok((
            "audio-delay",
            numeric_property_value(&update.value, -5.0, 5.0)?,
        )),
        "sub-font-size" => Ok((
            "sub-font-size",
            numeric_property_value(&update.value, 12.0, 96.0)?,
        )),
        "sub-border-size" | "sub-shadow-offset" => Ok((
            if property == "sub-border-size" {
                "sub-border-size"
            } else {
                "sub-shadow-offset"
            },
            numeric_property_value(&update.value, 0.0, 12.0)?,
        )),
        "sub-font" => {
            let value = string_property_value(&update.value)?.trim();
            if value.is_empty() || value.chars().count() > 80 || value.chars().any(char::is_control)
            {
                invalid()
            } else {
                Ok(("sub-font", value.to_string()))
            }
        }
        "sub-color" => {
            let value = string_property_value(&update.value)?;
            if value.len() == 9
                && value.starts_with('#')
                && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                Ok(("sub-color", value.to_string()))
            } else {
                invalid()
            }
        }
        _ => Err("The mpv property is not supported".to_string()),
    }
}

#[cfg(test)]
mod property_tests {
    use super::*;

    fn update(property: &str, value: Value) -> MpvPropertyUpdate {
        MpvPropertyUpdate {
            property: property.to_string(),
            value,
        }
    }

    #[test]
    fn accepts_supported_property_boundaries() {
        let cases = [
            update("video-aspect-override", Value::String("16:9".to_string())),
            update("video-crop", Value::String(String::new())),
            update("brightness", Value::from(-100)),
            update("gamma", Value::from(100)),
            update("scale-blur", Value::from(-0.9)),
            update("audio-delay", Value::from(5)),
            update("sub-font-size", Value::from(12)),
            update("sub-border-size", Value::from(12)),
            update("sub-color", Value::String("#FFFFFFFF".to_string())),
            update("sub-font", Value::String("sans-serif".to_string())),
        ];

        for case in cases {
            assert!(validate_mpv_property(&case).is_ok(), "{}", case.property);
        }
    }

    #[test]
    fn rejects_unknown_or_invalid_properties_without_echoing_values() {
        for case in [
            update("command", Value::String("quit".to_string())),
            update("brightness", Value::from(101)),
            update("audio-delay", Value::from(-5.1)),
            update("video-crop", Value::String("100%x100%".to_string())),
            update("sub-color", Value::String("secret".to_string())),
            update("sub-font", Value::String("bad\nfont".to_string())),
        ] {
            let error = validate_mpv_property(&case).unwrap_err();
            assert!(!error.contains("secret"));
            assert!(!error.contains("100%x100%"));
        }
    }
}
