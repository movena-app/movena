pub(crate) mod cache;
pub(crate) mod remote;
pub(crate) mod xmltv;

pub(crate) const MAX_M3U_BYTES: usize = 64 * 1024 * 1024;
pub(crate) const MAX_XMLTV_BYTES: usize = 128 * 1024 * 1024;
pub(crate) const XMLTV_CACHE_FRESH_MS: u64 = 6 * 60 * 60 * 1000;
