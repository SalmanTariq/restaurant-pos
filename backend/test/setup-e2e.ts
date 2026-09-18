process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.MYSQL_HOST = process.env.MYSQL_HOST ?? '127.0.0.1';
process.env.MYSQL_PORT = process.env.MYSQL_PORT ?? '3306';
process.env.MYSQL_USER = process.env.MYSQL_USER ?? 'pos';
process.env.MYSQL_PASSWORD = process.env.MYSQL_PASSWORD ?? 'pos';
process.env.MYSQL_DATABASE = process.env.MYSQL_DATABASE ?? 'pos_test';
process.env.BETTER_AUTH_SECRET = 'test-secret-must-be-at-least-32-chars!!';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3000';
