/**
 * Board tool actions.
 */
import { burnBootloaderDialogOpen } from "./state";

/** Open the Burn Bootloader confirm dialog. The dialog itself collects the
 *  programmer selection and invokes the backend on confirm — see
 *  `BurnBootloaderDialog.tsx`. */
export function openBurnBootloaderDialog() {
  burnBootloaderDialogOpen.value = true;
}
