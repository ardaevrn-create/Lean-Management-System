export interface RoleAssignment {
  permissions: string[];
  /** Kapsam birimi path'i; null = tüm şirket */
  orgUnitPath: string | null;
  orgUnitId: string | null;
}

export interface RequestUser {
  id: string;
  tenantId: string;
  username: string;
  fullName: string;
  employeeId: string | null;
  isPlatformAdmin: boolean;
  isApiKey: boolean;
  mustChangePassword: boolean;
  permissions: Set<string>;
  assignments: RoleAssignment[];
}
