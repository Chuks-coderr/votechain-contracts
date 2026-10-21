# Frontend Performance Benchmarks

This document tracks frontend performance metrics and benchmarks for VoteChain's React + Vite application.

## Target Benchmarks

| Metric | Target | Measured |
|--------|--------|----------|
| Proposal card render time (50 cards) | < 16ms | TBD |
| Search/filter re-render time | < 100ms | TBD |
| Initial page load (3G) | < 3s | TBD |
| Lighthouse performance score | ≥ 90 | TBD |

## Rendering Performance

### Proposal List Rendering

**Test Setup:**
- 50 proposal cards rendered
- Network: Simulated (no API calls)
- Device: Chrome DevTools throttle (desktop)

**Methodology:**
```javascript
// Measure render time
performance.mark('render-start');
// Render 50 proposal cards
performance.mark('render-end');
const measure = performance.measure('render', 'render-start', 'render-end');
console.log(`Render time: ${measure.duration}ms`);
```

**Results:**
- Initial render: TBD
- Re-render: TBD
- Status: TBD

### Search/Filter Re-render

**Test Setup:**
- Proposal list with 50 items
- Search by title (simulating rapid input)
- Filter by status

**Methodology:**
```javascript
// Measure filter re-render time
performance.mark('filter-start');
// Apply search filter
performance.mark('filter-end');
const measure = performance.measure('filter', 'filter-start', 'filter-end');
```

**Results:**
- Search filter re-render: TBD
- Status filter re-render: TBD
- Status: TBD

## Page Load Performance

### Initial Page Load Metrics

**Device:** Simulated 3G (slow-4g)
**Network:** Throttled to ~1.6Mbps download, 750Kbps upload, 150ms latency

**Metrics:**
- First Contentful Paint (FCP): TBD
- Largest Contentful Paint (LCP): TBD
- Time to Interactive (TTI): TBD
- Total Blocking Time (TBT): TBD
- Cumulative Layout Shift (CLS): TBD

### Bundle Size

| Package | Size | Gzipped |
|---------|------|---------|
| react | TBD | TBD |
| soroban-sdk | TBD | TBD |
| vite | TBD | TBD |
| Total | TBD | TBD |

## Lighthouse Scores

Measured using `lighthouse-ci` in GitHub Actions.

### Performance Categories

| Metric | Score |
|--------|-------|
| Performance | TBD |
| Accessibility | TBD |
| Best Practices | TBD |
| SEO | TBD |
| PWA | TBD |

## Running Benchmarks Locally

### Setup

```bash
cd frontend
npm install
npm run build
npm run preview  # Serve production build
```

### Chrome DevTools Profiling

1. Open Chrome DevTools (F12)
2. Go to "Performance" tab
3. Click "Record"
4. Perform action (scroll, filter, search)
5. Click "Stop"
6. Review flame chart and timings

### Lighthouse

```bash
# Install lighthouse-cli
npm install -g @lhci/cli@0.11.x

# Run audit
lighthouse http://localhost:4173 --output-path=./lighthouse-report.html

# View report
open lighthouse-report.html
```

### Vitest Performance Tests

```bash
# Run performance-focused tests
npm run test -- --grep performance

# Watch mode for iterative testing
npm run test:watch -- --grep performance
```

## CI/CD Performance Checks

The `lighthouse-ci.yml` workflow runs automated performance audits on every PR.

### Acceptance Criteria

- Lighthouse performance score ≥ 90
- No regression in FCP, LCP
- Total bundle size < 500KB (gzipped)

### Running Locally

```bash
# Configure lighthouse-ci
lhci autorun

# View results
lhci upload
```

## Optimization Strategies

### Code Splitting

- Lazy-load proposal detail views
- Code split by route with React.lazy()

### Image Optimization

- Use WebP with fallback to PNG
- Implement lazy loading for images
- Optimize SVG icons

### Bundle Optimization

- Tree-shake unused dependencies
- Monitor soroban-sdk bundle size
- Use dynamic imports for heavy features

### Runtime Performance

- Memoize expensive computations (useMemo)
- Optimize re-renders with React.memo
- Virtualize long lists (100+ items)

## Results History

Performance results are tracked over time to detect regressions.

### Latest Run (TBD)

- **Date:** TBD
- **Performance Score:** TBD
- **Load Time:** TBD
- **Status:** TBD

### Previous Runs

(To be populated with historical data)

## Known Issues

- TBD

## Future Improvements

- Implement service worker for offline support
- Add Web Workers for heavy computations
- Implement resource hints (dns-prefetch, preconnect, prefetch)
- Evaluate React 18 Suspense for data fetching
