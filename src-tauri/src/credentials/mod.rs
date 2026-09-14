pub(crate) mod source;
pub(crate) mod xtream;

#[cfg(not(feature = "desktop-e2e"))]
const CREDENTIAL_SERVICE: &str = "com.movena.desktop";
#[cfg(feature = "desktop-e2e")]
const CREDENTIAL_SERVICE: &str = "com.movena.desktop.e2e";
const CREDENTIAL_ACCOUNT: &str = "xtream-provider";
