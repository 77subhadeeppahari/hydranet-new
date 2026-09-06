import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { useGetCurrentUser } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';
import { AttendancePage, DashboardPage, ExpensesPage, HrPayrollPage, PlansPage, RolePermissionsPage, SettingsPage, SignInPage, TeamPage } from '@/pages/admin-pages';
import { CustomersPage } from '@/pages/customers-page';
import { PartnerAgreementsPage } from '@/pages/partner-agreements-page';
import { PartnerAgreementListPage } from '@/pages/partner-agreement-list-page';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function AuthGate() {
  const currentUser = useGetCurrentUser();
  if (currentUser.isLoading) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-6"><div className="w-full max-w-sm space-y-4"><div className="skeleton h-12 w-52 rounded-xl" /><div className="skeleton h-8 w-72 rounded-lg" /><div className="skeleton h-32 rounded-2xl" /></div></div>;
  }
  if (currentUser.isError || !currentUser.data) return <SignInPage />;
  return <Router user={currentUser.data} />;
}

function Router({ user }: { user: User }) {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/"><DashboardPage user={user} /></Route>
        <Route path="/plans"><PlansPage user={user} /></Route>
        <Route path="/customers"><CustomersPage user={user} /></Route>
        <Route path="/partner-agreements/new">{user.role === 'STAFF' ? <PartnerAgreementListPage user={user} /> : <PartnerAgreementsPage user={user} />}</Route>
        <Route path="/partner-agreements"><PartnerAgreementListPage user={user} /></Route>
        <Route path="/team"><TeamPage user={user} /></Route>
        <Route path="/attendance"><AttendancePage user={user} /></Route>
        <Route path="/expenses"><ExpensesPage user={user} /></Route>
        <Route path="/settings/roles"><RolePermissionsPage user={user} /></Route>
        <Route path="/hr/payroll"><HrPayrollPage user={user} /></Route>
        <Route path="/settings"><SettingsPage user={user} /></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <AuthGate />
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
