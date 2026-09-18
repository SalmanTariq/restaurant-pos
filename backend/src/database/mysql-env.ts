export type MysqlEnv = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function mysqlEnv(): MysqlEnv {
  return {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'pos',
    password: process.env.MYSQL_PASSWORD ?? 'pos',
    database: process.env.MYSQL_DATABASE ?? 'pos',
  };
}
