export default function Pagination({ pagination, onPage }) {
  if (!pagination) return null;
  const { page, totalPages, total } = pagination;
  return (
    <div className="pagination no-print">
      <span className="muted">{total} voucher{total === 1 ? '' : 's'}</span>
      <div>
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span className="page-info">Page {page} of {totalPages}</span>
        <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
