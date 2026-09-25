# Approval API contract

Base URL: `/api/v1/permission/approvals`. UUIDs are public identifiers, never database integer IDs.

| HTTP | Suffix | Exact route permission | requiredRoleType | Additional service permission |
| --- | --- | --- | --- | --- |
| POST | (base) | system.approval.create | SECURITY | system.role.grant; revocation requires system.role.revoke; MFA reset requires system.user.mfa-reset |
| GET | (base) | system.approval.read | BUSINESS (explicit shared catalog exception) | SECURITY or AUDIT role |
| GET | /:id | system.approval.detail | BUSINESS (explicit shared catalog exception) | SECURITY or AUDIT role |
| POST | /:id/approve | system.approval.approve | SECURITY | system.role.review |
| POST | /:id/execute | system.approval.execute | SECURITY | system.role.grant; revocation requires system.role.revoke; MFA reset requires system.user.mfa-reset |
| POST | /:id/review | system.approval.review | AUDIT | system.audit.review |

Main integration: seed six separate API permissions above, using the full base URL plus suffix. Add `system.approval.read/detail` to the explicit shared-admin catalog in authentication/grant policy; BUSINESS classification does not authorize BUSINESS/SYSTEM callers. Do not add a superadmin bypass or allow arbitrary shared catalog entries. SECURITY/AUDIT roles need explicit grants for the relevant route codes. Other modules, seed and migrations are outside this implementation's file ownership.

Creation body:

```ts
type CreateApproval = {
  kind: 'ROLE_GRANT' | 'ROLE_PERMISSIONS' | 'API_ROUTE_CHANGE' | 'API_CREATE' | 'API_UPDATE' | 'API_STATUS' | 'API_DELETE' | 'PAGE_ROUTE_CHANGE' | 'ELEVATED_SCOPE' | 'ROLE_REVOKE' | 'ROLE_PERMISSION_REVOKE' | 'ELEVATED_REVOKE' | 'MFA_RESET'
  reason: string // nonblank, <=255 characters
  expiresAt: string // ISO-8601 timestamp; future, at most 24 hours after creation
  payload:
    | { userId: string; roleId: string }
    | { roleId: string; permissionIds: string[] }
    | { apiId: string; code: string; method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; path: string }
    | { code: string; name: string; method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; path: string; resource: string; action: string } // API_CREATE
    | { apiId: string; name: string } // API_UPDATE
    | { apiId: string; status: 'ACTIVE'|'DISABLED' } // API_STATUS
    | { apiId: string } // API_DELETE
    | { pageId: string; route: string } // PAGE_ROUTE_CHANGE
    | { roleId: string; scopeType: 'CUSTOM'|'ALL'; resource: string;
        targets: { targetType: 'USER'|'DEPARTMENT'|'ORGANIZATION'|'TENANT'; targetId: string }[] }
    | { scopeId: string } // ELEVATED_REVOKE
    | { userId: string } // MFA_RESET
}
```

`payload` must match `kind` exactly. Unknown fields are rejected. `permissionIds` contains 1–200 unique UUIDs; only these permissions are granted/renewed or revoked. ROLE_REVOKE uses the ROLE_GRANT payload, ROLE_PERMISSION_REVOKE uses ROLE_PERMISSIONS payload. MFA_RESET accepts only the target user's public UUID, clears that user's MFA secret/counter and revokes active sessions during execution. CUSTOM needs 1–200 unique targets; ALL requires `targets: []`. Resource must exist in an active Permission. Targets are validated against User, Tenant, Organization or Department master tables and saved with typed foreign keys. No client-controlled authorization identity, actor ID, MFA timestamp, MFA secret or arbitrary operation is accepted.

`expiresAt` is both the deadline for approval/execution and the expiry written to grants/scopes. API changes are persistent configuration changes; their expiry only limits approval/execution, and does not automatically restore old routes. API route changes require an existing registered backend method/path, valid non-wildcard code, and no live RolePermission grants for that API; revoke and explicitly regrant through the appropriate workflow.

Approve/execute/review body: `{ "note": "nonblank reason, max 255 characters" }`. Every POST requires server-authenticated `mfaVerifiedAt` and `reauthenticatedAt` timestamps no older than five minutes; missing, invalid or future timestamps fail closed. Use the main authentication reauth flow before these actions; never submit timestamps in the approval body.

Lifecycle: `REQUESTED → APPROVED → EXECUTED → REVIEWED`. Applicant cannot approve. AUDIT reviewer must differ from applicant, approver and executor. Applicant/approver/executor/reviewer cannot be a beneficiary; for MFA_RESET, the target user cannot participate in any stage. Role/API changes also check role assignments. Approver and executor may be the same SECURITY account. Post-expiry review remains permitted; post-expiry approval/execution is rejected.

Success: `{ code: "000000", message: "success", data }`. Creation returns HTTP 201; other operations return HTTP 200. Mutation/detail data is the ApprovalRequest with `id`, human-readable `requestNo` (for example `20260925-8F3K2M7P`), `kind`, `status`, `payload`, `reason`, `expiresAt`, `applicantId`, nullable `approverId/executorId/reviewerId`, nullable stage timestamps/notes, and `createdAt/updatedAt`. Dates serialize as ISO strings. No internal numeric user IDs are returned. `id` remains the internal API identifier; operators should use `requestNo` when communicating about an approval.

List query: optional `status` and UUID `cursor`. List data: `{ items: ApprovalRequest[], nextCursor: string | null }`, fixed page size 50, newest first. Errors use the application's Problem Details envelope: 400 invalid payload/expiry/target, 403 permission/separation/reauth failure, 404 missing approval, 409 state race/serialization conflict or conflicting endpoint. On 409 refresh the record; never assume execution succeeded. State claim, target mutation and before/after audit all commit or roll back together in a Serializable transaction.

Revocations follow the same four stages and remain available for disabled roles/accounts and expired grants. No reject/cancel transition is exposed. Expired pending requests retain their stored status and should be displayed as expired based on `expiresAt`.
