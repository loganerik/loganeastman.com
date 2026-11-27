// The owner row under a card on an index page: visibility, edit, delete.
import VisibilityPill from './ui/VisibilityPill';
import DeleteButton from './ui/DeleteButton';
export default function CardTools({ id, title, type, visibility = 'public', editHref }: { id: string; title?: string; type: string; visibility?: string; editHref?: string }) {
  return (
    <p class="chips owner-row owner-row--tight card-tools">
      <VisibilityPill id={id} value={visibility} type={type} />
      {editHref && <a class="btn btn--soft btn--small" href={editHref}>Edit</a>}
      <DeleteButton rec={{ id, title, type }} />
    </p>
  );
}
