// Stays empty: the route is not known here, so any layout would be wrong.
export default function Loading() {
  return <div aria-busy="true" aria-label="Indlæser" />;
}
