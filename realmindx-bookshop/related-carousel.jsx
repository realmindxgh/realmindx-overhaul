import React from 'react';
import { Icon } from './shared.jsx';
import { ProductCard } from './chrome.jsx';
import { api, isApiMode } from '../src/lib/apiClient.js';
import { fromApiProduct } from './catalog.jsx';

const RELATED_LIMIT = 10;

const norm = (value) => String(value || '').trim().toLowerCase();

const levelFamily = (level) => {
  const m = norm(level).match(/(nursery|creche|kindergarten|kg|basic|primary|jhs|shs|middle)/);
  return m ? m[1] : '';
};

const levelNumber = (level) => {
  const m = norm(level).match(/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
};

const levelCloseness = (level, targetLevel) => {
  const famA = levelFamily(level);
  const famB = levelFamily(targetLevel);
  const numA = levelNumber(level);
  const numB = levelNumber(targetLevel);
  const gap = Math.abs((numA ?? 0) - (numB ?? 0));
  return famA && famB && famA === famB ? gap : 100 + gap;
};

export const selectRelatedBooks = (books, book) => {
  if (!book || !Array.isArray(books) || books.length === 0) return [];
  const subject = norm(book.subject);
  const level = norm(book.levelName);
  const curriculum = norm(book.curriculumName);
  const publisher = norm(book.publisher);
  const claimed = new Set([book.id]);
  const ordered = [];

  const take = (items) => items.filter(b => b.id !== book.id && !claimed.has(b.id));
  const claim = (items) => {
    items.forEach(b => { claimed.add(b.id); ordered.push(b); });
  };

  if (subject) {
    claim(take(books.filter(b => norm(b.subject) === subject && level && norm(b.levelName) === level)));
    claim(
      take(books.filter(b => norm(b.subject) === subject && norm(b.levelName) !== level))
        .sort((a, b) => levelCloseness(a.levelName, book.levelName) - levelCloseness(b.levelName, book.levelName))
    );
  }
  if (curriculum) claim(take(books.filter(b => norm(b.curriculumName) === curriculum)));
  if (publisher) claim(take(books.filter(b => norm(b.publisher) === publisher)));
  claim(take(books.filter(b => b.cat && book.cat && b.cat === book.cat)));

  const inStock = ordered.filter(b => b.stock);
  const ranked = inStock.length >= 5 ? inStock : [...inStock, ...ordered.filter(b => !b.stock)];
  return ranked.slice(0, RELATED_LIMIT);
};

let relatedCatalogPromise = null;

const getRelatedCatalog = () => {
  if (!relatedCatalogPromise) {
    relatedCatalogPromise = api.fetchProducts('?per_page=100')
      .then(data => (data.items || []).map(fromApiProduct))
      .catch(() => []);
  }
  return relatedCatalogPromise;
};

const RelatedSkeletonCard = () => (
  <div className="bs-pcard bs-pcard-skeleton" aria-hidden="true">
    <div className="bs-pcard-cover"><div className="bs-skeleton bs-skeleton-img" /></div>
    <div className="bs-pcard-body">
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-sm" />
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-lg" />
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-mid" />
      <div className="bs-skeleton bs-skeleton-line bs-skeleton-line-sm" />
    </div>
  </div>
);

export const RelatedCarousel = ({ books, book, navigate, loading = false }) => {
  const trackRef = React.useRef(null);
  const [canLeft, setCanLeft] = React.useState(false);
  const [canRight, setCanRight] = React.useState(false);
  const [fetchedBooks, setFetchedBooks] = React.useState(null);

  React.useEffect(() => {
    if (!isApiMode() || books.length > 0) { setFetchedBooks(null); return undefined; }
    let alive = true;
    getRelatedCatalog().then(list => { if (alive) setFetchedBooks(list); });
    return () => { alive = false; };
  }, [books]);

  const source = books.length > 0 ? books : (fetchedBooks || []);
  const fetching = books.length === 0 && isApiMode() && fetchedBooks === null;
  const related = React.useMemo(() => selectRelatedBooks(source, book), [source, book]);

  React.useEffect(() => {
    if (loading || related.length === 0) return undefined;
    const track = trackRef.current;
    if (!track) return undefined;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = track;
      const drift = Math.max(20, pageScroll() * 0.2);
      setCanLeft(scrollLeft > drift);
      setCanRight(scrollLeft < scrollWidth - clientWidth - drift);
    };
    update();
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(track);
      return () => {
        track.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        ro.disconnect();
      };
    }
    return () => {
      track.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [loading, related]);

  const pageScroll = () => {
    const track = trackRef.current;
    if (!track) return 0;
    const card = track.querySelector('.bs-pcard');
    if (!card) return Math.max(1, Math.round(track.clientWidth * 0.8));
    const gap = parseFloat(getComputedStyle(track).columnGap) || 18;
    return Math.max(1, Math.round(card.getBoundingClientRect().width + gap));
  };

  const scrollStep = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * pageScroll(), behavior: 'smooth' });
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); scrollStep(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); scrollStep(1); }
  };

  if (loading || fetching) {
    return (
      <section className="bs-section bs-related" aria-label="Related books">
        <div className="bs-section-head-row">
          <div>
            <h2 className="bs-h2">You May Also Like</h2>
            <p className="bs-related-sub">Explore more books for the same subject, class level, or curriculum.</p>
          </div>
        </div>
        <div className="bs-related-wrap">
          <div className="bs-related-track">
            {Array.from({ length: 5 }, (_, i) => <RelatedSkeletonCard key={i} />)}
          </div>
        </div>
      </section>
    );
  }

  if (related.length === 0) return null;

  return (
    <section className="bs-section bs-related" aria-label="Related books">
      <div className="bs-section-head-row">
        <div>
          <h2 className="bs-h2">You May Also Like</h2>
          <p className="bs-related-sub">Explore more books for the same subject, class level, or curriculum.</p>
        </div>
      </div>
      <div className="bs-related-wrap">
        <button
          type="button"
          className="bs-related-arrow bs-related-prev"
          aria-label="Previous books"
          onClick={() => scrollStep(-1)}
          disabled={!canLeft}
        >
          <Icon name="chevL" size={22} />
        </button>
        <div
          className="bs-related-track"
          ref={trackRef}
          tabIndex={0}
          role="group"
          aria-label="Related books carousel"
          onKeyDown={onKeyDown}
        >
          {related.map((b, i) => <ProductCard key={b.id} book={b} idx={i} navigate={navigate} />)}
        </div>
        <button
          type="button"
          className="bs-related-arrow bs-related-next"
          aria-label="Next books"
          onClick={() => scrollStep(1)}
          disabled={!canRight}
        >
          <Icon name="chevR" size={22} />
        </button>
      </div>
    </section>
  );
};
