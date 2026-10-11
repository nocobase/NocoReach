export type {
  AuthorizationPermission,
  AuthorizationSnapshot,
  RecordSelection,
  ResourceRef,
} from '@nocobase/authorization/core';

export interface PermissionGrantAction {
  action: string;
  policy?: Readonly<Record<string, unknown>> & { type: string };
}

export interface PermissionGrant {
  resource: { type: string; id: string };
  actions: readonly PermissionGrantAction[];
}

export type PermissionSetWriteOperation =
  'create' | 'update' | 'delete' | 'assign' | 'revoke';

export interface PermissionSetProtection {
  owner: string;
  allow: readonly PermissionSetWriteOperation[];
  /** Subject types the set may be assigned to. Absent means any. */
  assignableTo?: readonly string[];
}

export interface PermissionSet {
  key: string;
  title?: string | { key: string; ns: string };
  grants: readonly PermissionGrant[];
  /** Present when the set is protected; `allow` lists what the generic API may still do. */
  readonly protection?: PermissionSetProtection;
  /** True when holding this set grants unrestricted access. */
  readonly unrestricted?: boolean;
}

export interface PermissionSetAssignment {
  id: string;
  subject: { type: string; id: string };
  permissionSet: string;
}

export interface PermissionSetInput {
  key: string;
  title?: string | { key: string; ns: string };
  grants: readonly PermissionGrant[];
}

/** A title as the server sends it. */
export type LocalizedText =
  string | { key: string; ns?: string; defaultValue?: string };

/** One grantable action as the server sends it. */
interface OptionsActionResponse {
  name: string;
  title: LocalizedText;
}

/** What every `options` route answers. */
export interface AuthorizationOptionsResponse {
  readonly sections: readonly {
    name: string;
    title: LocalizedText;
    order: number;
    subsections: readonly {
      name: string;
      title: LocalizedText;
      /** Set when the client supplies the resources, such as pages. */
      recordType?: { type: string; actions: readonly OptionsActionResponse[] };
      resources: readonly {
        type: string;
        id: string;
        title: LocalizedText;
        description?: LocalizedText;
        group?: string;
        actions: readonly OptionsActionResponse[];
        dataScopes?: Readonly<
          Record<
            string,
            readonly {
              key: string;
              title: LocalizedText;
              collection: string;
              fields: readonly string[];
              recordAccess: readonly string[];
              defaultValue?: string;
            }[]
          >
        >;
      }[];
    }[];
  }[];
  readonly resourceGroups?: readonly {
    name: string;
    title: LocalizedText;
    parent?: string;
    order?: number;
  }[];
  readonly subjectTypes: readonly {
    type: string;
    title: LocalizedText;
    selection: { type: 'fixed'; id: string } | { type: 'collection' };
  }[];
  readonly recordAccess: readonly {
    key: string;
    title: LocalizedText;
    description?: LocalizedText;
    collections: readonly string[];
  }[];
  readonly collections: readonly { name: string; fields: readonly string[] }[];
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

/** One data scope of a composite action, as the workspace edits it. */
export interface DataScopeOption {
  key: string;
  label: string;
  collection: string;
  collectionFields: readonly string[];
  /** `''` selects nothing: only default access and sharing apply. */
  defaultValue: string;
  /** `''` first, then the record access this scope offers. */
  options: readonly SelectOption[];
}

export interface ResourceOption extends SelectOption {
  /** The resource type grants store; never displayed. */
  type: string;
  searchText?: string;
  group?: string;
  actions?: readonly SelectOption[];
  /** Composite items only: the data scopes of each action. */
  dataScopes?: Readonly<Record<string, readonly DataScopeOption[]>>;
}

export interface ResourceGroupOption extends SelectOption {
  children?: readonly ResourceGroupOption[];
}

/** A left-side entry: its resources, grouped by `groups`. */
export interface SubsectionOption {
  value: string;
  label: string;
  /** Set when the client supplies the resources, such as `page`. */
  recordType?: string;
  /** The record type's actions, else every action its resources name. */
  actions: readonly SelectOption[];
  groups: readonly ResourceGroupOption[];
  resources: readonly ResourceOption[];
}

/** A left-side heading. */
export interface SectionOption {
  value: string;
  label: string;
  order: number;
  subsections: readonly SubsectionOption[];
}

export interface DatabaseCollectionOption {
  name: string;
  fields: readonly string[];
}

export interface SubjectTypeOption extends SelectOption {
  selection?: { type: 'fixed'; id: string } | { type: 'collection' };
}

export interface SubjectOption {
  id: string;
  /** Plain text, or a `{ key, ns }` descriptor rendered in the viewer's language. */
  title: LocalizedText;
  description?: LocalizedText;
}

/** The workspace model an `options` response is localized into. */
export interface AuthorizationOptions {
  sections: readonly SectionOption[];
  subjectTypes: readonly SubjectTypeOption[];
  collections: readonly DatabaseCollectionOption[];
  recordAccess: readonly SelectOption[];
}

export interface AuthorizationRecordOption {
  id: string;
  label: string;
  description?: string;
}

export interface AuthorizationSubject {
  type: string;
  id: string;
}

/** One reason a decision came out as it did, as the core gave it. */
export interface AuthorizationReason {
  code: string;
  message: string;
  /** The plugin the reason came from; absent when the core itself said it. */
  plugin?: string;
  details?: Readonly<Record<string, unknown>>;
}

export type AuthorizationEffect = 'permit' | 'conditional' | 'deny';

/** What the core decided, with why, and what it holds for when conditional. */
export interface AuthorizationDecision {
  checks?: readonly AuthorizationInspection[];
  effect: AuthorizationEffect;
  conditions?: Readonly<Record<string, unknown>> & { type: string };
  reasons: readonly AuthorizationReason[];
}

export interface AuthorizationInspectInput {
  subject: AuthorizationSubject;
  resource: { type: string; id: string };
  action: string;
}

export interface AuthorizationInspection {
  resource: { type: string; id: string };
  action: string;
  decision: AuthorizationDecision;
}

/** What a subject's stored grants cover, without deciding any of them. */
export interface ConfiguredAccess {
  unrestricted: boolean;
  types: readonly string[];
  resources: readonly { type: string; id: string }[];
  /** The subjects the principal inherits, as a request would resolve them. */
  identity?: { subjects: readonly AuthorizationSubject[] };
  /** Each effective set with the assignments that bring it; none for a default set. */
  sets?: readonly ConfiguredPermissionSet[];
}

export interface ConfiguredPermissionSet {
  key: string;
  title?: PermissionSet['title'];
  /** The principal itself for a direct assignment, else an inherited subject. */
  sources: readonly AuthorizationSubject[];
}
