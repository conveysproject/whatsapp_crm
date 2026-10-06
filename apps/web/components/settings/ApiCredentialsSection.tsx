"use client";

import { JSX, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PermissionGate } from "@/components/PermissionGate";
import { CopyButton, CredentialRevealDialog } from "@/components/settings/CredentialRevealDialog";
import {
  ApiCredentialsError,
  createCredential,
  formatDate,
  formatLastUsed,
  listCredentials,
  messageForError,
  revokeCredential,
  rotateCredential,
  updateCredential,
  validateCredentialInput,
  type ApiCredential,
  type CredentialFormErrors,
  type CredentialInput,
  type RevealedCredential,
} from "@/lib/api-credentials";

const QUERY_KEY = ["api-credentials"] as const;

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; cred: ApiCredential }
  | { kind: "rotate"; cred: ApiCredential }
  | { kind: "revoke"; cred: ApiCredential }
  | null;

interface Reveal {
  title: string;
  credential: RevealedCredential;
}

const primaryBtn =
  "px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500";
const secondaryBtn =
  "px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-500";
const inputCls = "w-full border rounded px-3 py-1.5 text-sm dark:bg-gray-800";

function DialogShell({
  title,
  description,
  onClose,
  busy,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white dark:bg-gray-900 p-6 shadow-xl space-y-4">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="text-sm text-gray-600 dark:text-gray-300">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ErrorLine({ message }: { message: string | null }): JSX.Element | null {
  if (!message) return null;
  return <p role="alert" className="text-sm text-red-600">{message}</p>;
}

function CredentialFormDialog({
  mode,
  initial,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  initial?: ApiCredential;
  onClose: () => void;
  onDone: (revealed?: RevealedCredential) => void;
}): JSX.Element {
  const [form, setForm] = useState<CredentialInput>({
    name: initial?.name ?? "",
    callbackUrl: initial?.callbackUrl ?? "",
    inboundUrl: initial?.inboundUrl ?? "",
  });
  const [errors, setErrors] = useState<CredentialFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (pending) return;
    const v = validateCredentialInput(form);
    setErrors(v);
    setServerError(null);
    if (Object.keys(v).length > 0) return;
    setPending(true);
    try {
      if (mode === "create") {
        onDone(await createCredential(form));
      } else if (initial) {
        await updateCredential(initial.id, form);
        onDone();
      }
    } catch (err) {
      setServerError(messageForError(err));
      setPending(false);
    }
  };

  const field = (
    key: keyof CredentialInput,
    label: string,
    opts: { placeholder?: string; required?: boolean; type?: string },
  ): JSX.Element => {
    const id = `cred-${mode}-${key}`;
    const err = errors[key];
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium mb-1">
          {label}{opts.required ? " *" : ""}
        </label>
        <input
          id={id}
          type={opts.type ?? "text"}
          value={form[key]}
          placeholder={opts.placeholder}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-err` : undefined}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className={inputCls}
        />
        {err && <p id={`${id}-err`} className="text-xs text-red-600 mt-1">{err}</p>}
      </div>
    );
  };

  return (
    <DialogShell
      title={mode === "create" ? "Create API credential" : "Edit API credential"}
      description={
        mode === "create"
          ? "A new Auth ID and Auth Token are generated for the WBMSG API."
          : undefined
      }
      onClose={onClose}
      busy={pending}
    >
      <form onSubmit={(e) => { void submit(e); }} noValidate className="space-y-3">
        {field("name", "Name", { required: true, placeholder: "e.g. Production backend" })}
        {field("callbackUrl", "Callback URL (optional)", { type: "url", placeholder: "https://example.com/status" })}
        <p className="-mt-2 text-xs text-gray-500">Default URL for message status callbacks.</p>
        {field("inboundUrl", "Inbound URL (optional)", { type: "url", placeholder: "https://example.com/inbound" })}
        <p className="-mt-2 text-xs text-gray-500">Receives inbound WhatsApp messages.</p>
        <ErrorLine message={serverError} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryBtn}>Cancel</button>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Saving..." : mode === "create" ? "Create credential" : "Save changes"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  destructive,
  action,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DialogShell title={title} description={description} onClose={onClose} busy={pending}>
      <ErrorLine message={error} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={pending} className={secondaryBtn}>Cancel</button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            setError(null);
            action().catch((err: unknown) => {
              setError(messageForError(err));
              setPending(false);
            });
          }}
          className={destructive
            ? "px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
            : primaryBtn}
        >
          {pending ? "Working..." : confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}

function UrlLine({ label, url }: { label: string; url: string | null }): JSX.Element | null {
  if (!url) return null;
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={url}>
      <span className="font-medium">{label}:</span> {url}
    </p>
  );
}

function CredentialRow({
  cred,
  onAction,
}: {
  cred: ApiCredential;
  onAction: (kind: "edit" | "rotate" | "revoke", cred: ApiCredential) => void;
}): JSX.Element {
  const revoked = cred.revokedAt !== null;
  return (
    <li
      data-testid="credential-row"
      data-revoked={revoked ? "true" : "false"}
      className={`p-4 space-y-2 ${revoked ? "opacity-60 bg-gray-50 dark:bg-gray-800/40" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm truncate" title={cred.name}>{cred.name}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${revoked ? "bg-gray-200 text-gray-700" : "bg-green-100 text-green-800"}`}
          >
            {revoked ? "Revoked" : "Active"}
          </span>
        </div>
        {!revoked && (
          <div className="flex gap-2">
            <button type="button" onClick={() => onAction("edit", cred)} aria-label={`Edit ${cred.name}`} className="text-xs px-2 py-1 border rounded hover:bg-gray-50 dark:hover:bg-gray-800">Edit</button>
            <button type="button" onClick={() => onAction("rotate", cred)} aria-label={`Rotate token for ${cred.name}`} className="text-xs px-2 py-1 border rounded hover:bg-gray-50 dark:hover:bg-gray-800">Rotate</button>
            <button type="button" onClick={() => onAction("revoke", cred)} aria-label={`Revoke ${cred.name}`} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">Revoke</button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Auth ID</span>
        <code className="text-xs font-mono break-all">{cred.id}</code>
        <CopyButton value={cred.id} label={`Copy Auth ID for ${cred.name}`} />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4">
        <span>Last used: {formatLastUsed(cred.lastUsedAt)}</span>
        <span>Created: {formatDate(cred.createdAt)}</span>
      </div>
      <UrlLine label="Callback URL" url={cred.callbackUrl} />
      <UrlLine label="Inbound URL" url={cred.inboundUrl} />
    </li>
  );
}

function ApiCredentialsBody(): JSX.Element {
  const qc = useQueryClient();
  const { data, error, isLoading, refetch, isFetching } = useQuery<ApiCredential[], Error>({
    queryKey: QUERY_KEY,
    queryFn: listCredentials,
    retry: false,
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  const refresh = (): Promise<void> => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const planRequired = error instanceof ApiCredentialsError && error.code === "PLAN_REQUIRED";

  let content: JSX.Element;
  if (isLoading) {
    content = <p className="text-sm text-gray-400">Loading…</p>;
  } else if (planRequired) {
    content = (
      <p role="status" className="text-sm rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-3 py-2 text-blue-900 dark:text-blue-200">
        API access is not enabled for your plan. Contact support to enable it.
      </p>
    );
  } else if (error) {
    content = (
      <div role="alert" className="flex items-center justify-between gap-3 text-sm rounded-md bg-red-50 dark:bg-red-950 border border-red-200 px-3 py-2 text-red-700 dark:text-red-300">
        <span>{messageForError(error)}</span>
        <button type="button" onClick={() => { void refetch(); }} disabled={isFetching} className="px-3 py-1 border border-red-300 rounded hover:bg-red-100 disabled:opacity-50">Retry</button>
      </div>
    );
  } else if (!data || data.length === 0) {
    content = (
      <div className="text-center py-6 space-y-2">
        <p className="text-sm font-medium">No API credentials yet</p>
        <p className="text-sm text-gray-500">
          Create a credential to send WhatsApp messages from your own systems using the WBMSG API.
        </p>
      </div>
    );
  } else {
    content = (
      <ul className="divide-y border rounded-lg">
        {data.map((c) => (
          <CredentialRow key={c.id} cred={c} onAction={(kind, cred) => setDialog({ kind, cred })} />
        ))}
      </ul>
    );
  }

  const closeDialog = (): void => setDialog(null);

  return (
    <section className="border rounded-lg p-5 space-y-4" aria-labelledby="api-credentials-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="api-credentials-heading" className="font-medium">API Credentials</h2>
          <p className="text-sm text-gray-500">
            Auth ID and Auth Token for the WBMSG API. Tokens are shown only once, when created or rotated.
          </p>
        </div>
        {!planRequired && !error && !isLoading && (
          <button type="button" onClick={() => setDialog({ kind: "create" })} className={`${primaryBtn} shrink-0`}>
            Create credential
          </button>
        )}
      </div>

      {content}

      {dialog?.kind === "create" && (
        <CredentialFormDialog
          mode="create"
          onClose={closeDialog}
          onDone={(r) => {
            closeDialog();
            if (r) setReveal({ title: "API credential created", credential: r });
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <CredentialFormDialog
          mode="edit"
          initial={dialog.cred}
          onClose={closeDialog}
          onDone={() => {
            closeDialog();
            toast.success("API credential updated");
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "rotate" && (
        <ConfirmDialog
          title={`Rotate token for ${dialog.cred.name}?`}
          description="The current token stops working immediately. Update your integration with the new token."
          confirmLabel="Rotate token"
          onClose={closeDialog}
          action={async () => {
            const r = await rotateCredential(dialog.cred.id, dialog.cred.name);
            closeDialog();
            setReveal({ title: "New token generated", credential: r });
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "revoke" && (
        <ConfirmDialog
          title={`Revoke ${dialog.cred.name}?`}
          description={`Revoke ${dialog.cred.name}? Requests using this credential will fail immediately. This cannot be undone.`}
          confirmLabel="Revoke"
          destructive
          onClose={closeDialog}
          action={async () => {
            await revokeCredential(dialog.cred.id);
            closeDialog();
            toast.success("API credential revoked");
            await refresh();
          }}
        />
      )}
      {reveal && (
        <CredentialRevealDialog
          title={reveal.title}
          credential={reveal.credential}
          onClose={() => setReveal(null)}
        />
      )}
    </section>
  );
}

export function ApiCredentialsSection(): JSX.Element {
  return (
    <PermissionGate permission="settings_access" sub="api_credentials">
      <ApiCredentialsBody />
    </PermissionGate>
  );
}
