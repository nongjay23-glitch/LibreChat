import { Clock, FolderKanban, Plus, ShieldCheck } from "lucide-react";

export default function CoworkRoomsList() {
  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 py-4 text-sm">
      <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
        <div className="mb-2 flex items-center gap-2 text-text-primary">
          <FolderKanban className="h-5 w-5 text-blue-500" aria-hidden="true" />
          <h2 className="text-base font-semibold">Cowork rooms</h2>
        </div>
        <p className="text-xs leading-5 text-text-secondary">
          Work rooms and task history will live here. This shell keeps Cowork
          separate from normal Chat history.
        </p>
      </div>

      <button
        type="button"
        disabled
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border-light bg-surface-secondary px-3 text-xs font-semibold text-text-secondary opacity-70"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        New room coming later
      </button>

      <div className="rounded-lg border border-dashed border-border-light bg-surface-primary p-3">
        <div className="flex items-start gap-2">
          <Clock
            className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              No Cowork rooms yet
            </div>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Local Cowork rooms/messages are planned for the next phase. No
              room persistence is implemented in this shell.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
            aria-hidden="true"
          />
          <p className="text-xs leading-5 text-text-secondary">
            Cowork does not edit files, run tools, apply patches, or write to
            normal Chat history in this phase.
          </p>
        </div>
      </div>
    </section>
  );
}
