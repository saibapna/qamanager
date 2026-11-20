import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { SesiDetailPage } from './pages/SesiDetailPage';
import { ValidatePage } from './pages/ValidatePage';
import { DiffViewerPage } from './pages/DiffViewerPage';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/templates/:id" element={<TemplateEditorPage />} />
            <Route path="/templates/:id/diff" element={<DiffViewerPage />} />
            <Route path="/sesi/:id" element={<SesiDetailPage />} />
            <Route path="/validate" element={<ValidatePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
