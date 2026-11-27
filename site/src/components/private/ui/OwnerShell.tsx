// Mounted once per page for the signed-in owner: the toast and the confirm sheet every owner control relies on.
import Toaster from './Toaster';
import ConfirmHost from './ConfirmHost';
export default function OwnerShell() {
  return (<><Toaster /><ConfirmHost /></>);
}
