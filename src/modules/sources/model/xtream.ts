export interface XtreamCredentials {
  /** Runtime source identity; stored only inside that source's vault record. */
  sourceId?: string | undefined;
  url: string;
  alternativeUrls?: string[] | undefined;
  displayName?: string | undefined;
  /** Optional source-specific XMLTV override, kept with the secure connection record. */
  epgUrl?: string | undefined;
  username: string;
  password: string;
}

export interface XtreamUserInfo {
  username: string;
  password?: string | undefined;
  message: string;
  auth: number;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface XtreamServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timestamp_now: number;
  time_now: string;
  timezone: string;
}
