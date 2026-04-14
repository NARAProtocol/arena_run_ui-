import type { FeedItem } from "../shared/arena";

export function FeedCard({ feed }: { feed: FeedItem[] }) {
  return (
    <article className="arena-card feed-card">
      <div className="section-head compact-head">
        <div>
          <span>feed</span>
          <strong>recent actions</strong>
        </div>
      </div>
      <div className="feed-list compact-list">
        {feed.length ? (
          feed.map((item, index) => (
            <div
              key={item.id}
              className={`feed-item feed-${item.type}`}
              style={{ animationDelay: `${index * 35}ms` }}
            >
              <span className="feed-label">{item.label}</span>
              <span>{item.meta}</span>
            </div>
          ))
        ) : (
          <div className="empty-slot">Recent joins, burns, and settlements will show here.</div>
        )}
      </div>
    </article>
  );
}
