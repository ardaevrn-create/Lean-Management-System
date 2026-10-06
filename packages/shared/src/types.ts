export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  username: string;
  fullName: string;
  email: string | null;
  locale: string;
  mustChangePassword: boolean;
  permissions: string[];
  employeeId: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
