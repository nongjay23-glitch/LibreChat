import { ClipboardList, MessageSquareText, ShieldCheck } from "lucide-react";

export default function CoworkChatView() {
  return (
    <main className="flex h-full min-h-0 flex-col bg-surface-primary text-text-primary">
      <div className="flex h-[52px] shrink-0 items-center border-b border-border-light px-4">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareText
            className="h-5 w-5 shrink-0 text-blue-500"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">Cowork Chat</h1>
            <p className="truncate text-xs text-text-secondary">
              Work/action mode for task-focused AI collaboration.
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
        <section className="w-full max-w-2xl rounded-lg border border-border-light bg-surface-secondary p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-green-500"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text-primary">
                Separate Cowork surface
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                This placeholder is separate from normal Chat. Real Cowork rooms
                and Cowork-only messages will be added later.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-border-light bg-surface-primary p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquareText
                  className="h-4 w-4 text-blue-500"
                  aria-hidden="true"
                />
                Cowork-only messages
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                This shell does not load, show, save, or send normal Chat
                conversation messages.
              </p>
            </div>
            <div className="rounded-md border border-border-light bg-surface-primary p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardList
                  className="h-4 w-4 text-text-secondary"
                  aria-hidden="true"
                />
                No actions yet
              </div>
              <p className="mt-2 text-xs leading-5 text-text-secondary">
                Cowork does not call AI, edit files, run tools, or save room
                data in this phase.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
