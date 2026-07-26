import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react';

type NavigateOptions = { replace?: boolean };
type NavigateFunction = (to: string | number, options?: NavigateOptions) => void;
type LocationState = { pathname: string; search: string; hash: string };
type RouteMatch = { params: Record<string, string> };

const RouterContext = createContext<
  | {
      location: LocationState;
      navigate: NavigateFunction;
    }
  | null
>(null);

const MatchContext = createContext<RouteMatch>({ params: {} });

function readBrowserLocation(): LocationState {
  return {
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || '',
  };
}

function parseEntry(entry: string): LocationState {
  const url = new URL(entry, 'https://northwind.local');
  return { pathname: url.pathname || '/', search: url.search, hash: url.hash };
}

function createHref(to: string): string {
  return to.startsWith('/') ? to : `/${to}`;
}

export function BrowserRouter({ children }: PropsWithChildren) {
  const [location, setLocation] = useState(readBrowserLocation);

  useEffect(() => {
    const onPopState = () => setLocation(readBrowserLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback<NavigateFunction>((to, options) => {
    if (typeof to === 'number') {
      window.history.go(to);
      return;
    }
    const href = createHref(to);
    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', href);
    setLocation(readBrowserLocation());
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function MemoryRouter({
  children,
  initialEntries = ['/'],
}: PropsWithChildren<{ initialEntries?: string[] }>) {
  const [entries, setEntries] = useState(() => initialEntries.map(parseEntry));
  const [index, setIndex] = useState(0);
  const location = entries[index] ?? parseEntry('/');

  const navigate = useCallback<NavigateFunction>(
    (to, options) => {
      if (typeof to === 'number') {
        setIndex((current) => Math.min(Math.max(current + to, 0), entries.length - 1));
        return;
      }
      const next = parseEntry(createHref(to));
      setEntries((current) => {
        if (options?.replace) {
          const copy = [...current];
          copy[index] = next;
          return copy;
        }
        return [...current.slice(0, index + 1), next];
      });
      if (!options?.replace) setIndex((current) => current + 1);
    },
    [entries.length, index],
  );

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter() {
  const router = useContext(RouterContext);
  if (!router) throw new Error('Northwind router hooks must be used inside a Router.');
  return router;
}

function matchPath(pattern: string, pathname: string): RouteMatch | null {
  if (pattern === '*') return { params: {} };
  const pathSegments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const patternSegments = pattern.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (pathSegments.length !== patternSegments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const expected = patternSegments[index]!;
    const actual = pathSegments[index]!;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return { params };
}

export function Route(props: { path: string; element: ReactNode }) {
  void props;
  return null;
}

export function Routes({ children }: PropsWithChildren) {
  const { location } = useRouter();
  let fallback: ReactElement<{ path: string; element: ReactNode }> | null = null;
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ path: string; element: ReactNode }>(child)) continue;
    if (child.props.path === '*') {
      fallback = child;
      continue;
    }
    const match = matchPath(child.props.path, location.pathname);
    if (match) {
      return <MatchContext.Provider value={match}>{child.props.element}</MatchContext.Provider>;
    }
  }
  if (fallback) {
    return <MatchContext.Provider value={{ params: {} }}>{fallback.props.element}</MatchContext.Provider>;
  }
  return null;
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);
  return null;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useParams() {
  return useContext(MatchContext).params;
}

export function useLocation() {
  return useRouter().location;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void] {
  const { location, navigate } = useRouter();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const setParams = useCallback(
    (next: URLSearchParams | Record<string, string>) => {
      const nextParams = next instanceof URLSearchParams ? next : new URLSearchParams(next);
      const query = nextParams.toString();
      navigate(`${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
    },
    [location.hash, location.pathname, navigate],
  );
  return [params, setParams];
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function Link({
  to,
  onClick,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }) {
  const navigate = useNavigate();
  const href = createHref(to);
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || !isPlainLeftClick(event) || props.target) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}

export function NavLink({
  to,
  className,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'> & {
  to: string;
  className?: string | ((state: { isActive: boolean }) => string);
}) {
  const { location } = useRouter();
  const href = createHref(to);
  const isActive = location.pathname === href || location.pathname.startsWith(`${href}/`);
  return (
    <Link
      {...props}
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={typeof className === 'function' ? className({ isActive }) : className}
    />
  );
}

export function createRoutesFromChildren(children: ReactNode) {
  return Children.toArray(children).filter(isValidElement);
}

export function cloneRouteElement(element: ReactElement, props: Record<string, unknown>) {
  return cloneElement(element, props);
}
