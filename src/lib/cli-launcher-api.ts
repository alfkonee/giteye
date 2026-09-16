import { tracedInvoke } from "./invoke-trace";

export interface CliLauncherStatus {
  path: string;
  installed: boolean;
  onPath: boolean;
  instructions: string;
}

export const cliLauncherApi = {
  status: () => tracedInvoke<CliLauncherStatus>("get_cli_launcher_status"),
  install: () => tracedInvoke<CliLauncherStatus>("install_cli_launcher"),
  uninstall: () => tracedInvoke<CliLauncherStatus>("uninstall_cli_launcher"),
};
