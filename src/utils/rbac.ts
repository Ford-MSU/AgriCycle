import { Role } from '../types';

export enum Permission {
  // Administrator
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_SYSTEM_SETTINGS = 'MANAGE_SYSTEM_SETTINGS',
  VIEW_AUDIT_LOGS = 'VIEW_AUDIT_LOGS',
  VIEW_ADMIN_REPORTS = 'VIEW_ADMIN_REPORTS',
  VIEW_SYSTEM_WIDE_RECORDS = 'VIEW_SYSTEM_WIDE_RECORDS',

  // LGU Biomass Information Coordinator
  REGISTER_BIOMASS_SOURCE = 'REGISTER_BIOMASS_SOURCE',
  MANAGE_BIOMASS_RECORDS = 'MANAGE_BIOMASS_RECORDS',
  VIEW_VALIDATION_QUEUE = 'VIEW_VALIDATION_QUEUE',
  VALIDATE_BIOMASS_RECORD = 'VALIDATE_BIOMASS_RECORD',
  MANAGE_MAP_INFO = 'MANAGE_MAP_INFO',
  CREATE_AGGREGATION_GROUP = 'CREATE_AGGREGATION_GROUP',
  MANAGE_AGGREGATION_GROUPS = 'MANAGE_AGGREGATION_GROUPS',
  VIEW_INQUIRIES = 'VIEW_INQUIRIES',
  RESPOND_TO_INQUIRIES = 'RESPOND_TO_INQUIRIES',

  // Shared / Planning / Inquiry
  VIEW_VALIDATED_RECORDS = 'VIEW_VALIDATED_RECORDS',
  VIEW_GIS_MAP = 'VIEW_GIS_MAP',
  VIEW_AGGREGATION_SUMMARIES = 'VIEW_AGGREGATION_SUMMARIES',
  GENERATE_REPORTS = 'GENERATE_REPORTS',

  // Buyer / Institutional Inquirer
  BROWSE_VALIDATED_LISTINGS = 'BROWSE_VALIDATED_LISTINGS',
  SUBMIT_INQUIRY = 'SUBMIT_INQUIRY',
  VIEW_OWN_INQUIRIES = 'VIEW_OWN_INQUIRIES',
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMINISTRATOR]: [
    Permission.MANAGE_USERS,
    Permission.MANAGE_SYSTEM_SETTINGS,
    Permission.VIEW_AUDIT_LOGS,
    Permission.VIEW_ADMIN_REPORTS,
    Permission.VIEW_SYSTEM_WIDE_RECORDS,
  ],
  [Role.COORDINATOR]: [
    Permission.REGISTER_BIOMASS_SOURCE,
    Permission.MANAGE_BIOMASS_RECORDS,
    Permission.VIEW_VALIDATION_QUEUE,
    Permission.VALIDATE_BIOMASS_RECORD,
    Permission.VIEW_SYSTEM_WIDE_RECORDS,
    Permission.VIEW_VALIDATED_RECORDS,
    Permission.VIEW_GIS_MAP,
    Permission.MANAGE_MAP_INFO,
    Permission.CREATE_AGGREGATION_GROUP,
    Permission.MANAGE_AGGREGATION_GROUPS,
    Permission.VIEW_AGGREGATION_SUMMARIES,
    Permission.VIEW_INQUIRIES,
    Permission.RESPOND_TO_INQUIRIES,
    Permission.GENERATE_REPORTS,
  ],
  [Role.LGU]: [
    Permission.VIEW_VALIDATED_RECORDS,
    Permission.VIEW_GIS_MAP,
    Permission.VIEW_AGGREGATION_SUMMARIES,
    Permission.GENERATE_REPORTS,
  ],
  [Role.BUYER]: [
    Permission.BROWSE_VALIDATED_LISTINGS,
    Permission.SUBMIT_INQUIRY,
    Permission.VIEW_OWN_INQUIRIES,
    Permission.VIEW_GIS_MAP,
  ],
};

export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  [Role.ADMINISTRATOR]: 'Administrator',
  [Role.COORDINATOR]: 'LGU Biomass Information Coordinator',
  [Role.LGU]: 'LGU/Institutional Planning User',
  [Role.BUYER]: 'Buyer/Institutional Inquirer',
};

export const ROLE_SHORT_NAMES: Record<Role, string> = {
  [Role.ADMINISTRATOR]: 'Administrator',
  [Role.COORDINATOR]: 'Biomass Coordinator',
  [Role.LGU]: 'Planning User (View-Only)',
  [Role.BUYER]: 'Buyer / Inquirer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  [Role.ADMINISTRATOR]: 'Manage users, permissions, settings, and audit logs.',
  [Role.COORDINATOR]: 'Manage sources, records, validation, GIS, aggregation, and inquiries.',
  [Role.LGU]: 'View-only validated records, maps, summaries, and reports.',
  [Role.BUYER]: 'Browse validated listings and submit non-binding inquiries.',
};

export const getRoleDisplayName = (role?: Role | string | null): string => {
  if (!role) return 'Unknown Role';
  if (role in ROLE_DISPLAY_NAMES) {
    return ROLE_DISPLAY_NAMES[role as Role];
  }
  return String(role);
};

export const getRoleShortName = (role?: Role | string | null): string => {
  if (!role) return 'Unknown';
  if (role in ROLE_SHORT_NAMES) {
    return ROLE_SHORT_NAMES[role as Role];
  }
  return String(role);
};

export const getRoleBadgeStyle = (role?: Role | string | null): string => {
  switch (role) {
    case Role.ADMINISTRATOR:
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case Role.COORDINATOR:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case Role.LGU:
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case Role.BUYER:
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const ROUTE_ALLOWED_ROLES: Record<string, Role[]> = {
  '/': [Role.ADMINISTRATOR, Role.COORDINATOR, Role.LGU, Role.BUYER],
  '/biomass-records': [Role.COORDINATOR, Role.LGU],
  '/aggregation-hubs': [Role.COORDINATOR, Role.LGU],
  '/aggregation': [Role.COORDINATOR, Role.LGU],
  '/listings': [Role.BUYER],
  '/inquiries': [Role.COORDINATOR, Role.BUYER],
  '/map': [Role.COORDINATOR, Role.LGU, Role.BUYER],
  '/reports': [Role.ADMINISTRATOR, Role.COORDINATOR, Role.LGU],
  '/users': [Role.ADMINISTRATOR],
  '/audit-logs': [Role.ADMINISTRATOR],
};

export const canAccessRoute = (role: Role | undefined, path: string): boolean => {
  if (!role) return false;
  const cleanPath = path.split('?')[0];
  if (cleanPath.startsWith('/listings')) {
    return ROUTE_ALLOWED_ROLES['/listings'].includes(role);
  }
  const allowed = ROUTE_ALLOWED_ROLES[cleanPath];
  if (!allowed) return false;
  return allowed.includes(role);
};

export const hasPermission = (role: Role | undefined | null, permission: Permission): boolean => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};
