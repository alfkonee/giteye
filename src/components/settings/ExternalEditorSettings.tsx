import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { gitApi } from "../../lib/tauri-api";
import { gitActionErrorMessage } from "../../lib/git-data";
import { Button } from "../ui";

export function ExternalEditorSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: gitApi.getAppSettings,
  });
  const update = useMutation({
    mutationFn: gitApi.setExternalEditorPath,
    onSuccess: (value) => queryClient.setQueryData(["app-settings"], value),
  });
  const choose = async () => {
    const path = await open({
      title: "Choose external editor executable or application",
      multiple: false,
      directory: false,
    });
    if (typeof path === "string") update.mutate(path);
  };
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
      <h3 className="text-sm font-semibold">External conflict editor</h3>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Choose an editor for conflict files. This device-only preference is not
        exported. With no selection, GitEye uses your system file association.
      </p>
      <p className="my-3 break-all font-mono text-xs">
        {settings.data?.externalEditorPath ?? "System default application"}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={update.isPending || settings.isPending}
          onClick={() => void choose()}
        >
          Choose editor
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={update.isPending || !settings.data?.externalEditorPath}
          onClick={() => update.mutate(null)}
        >
          Use system default
        </Button>
      </div>
      {settings.error || update.error ? (
        <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">
          {gitActionErrorMessage(settings.error ?? update.error)}
        </p>
      ) : null}
    </section>
  );
}
