export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
  data_dir: string;
  database_path: string;
  database_exists: boolean;
};

