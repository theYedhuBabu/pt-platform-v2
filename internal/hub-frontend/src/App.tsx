import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './layouts/DashboardLayout';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import TestDetails from './pages/TestDetails';
import CreateRun from './pages/CreateRun';
import CreateTest from './pages/CreateTest';
import RunLive from './pages/RunLive';
import Frameworks from './pages/Frameworks';
import FrameworkDetail from './pages/FrameworkDetail';
import ActiveRuns from './pages/ActiveRuns';
import Agents from './pages/Agents';
import History from './pages/History';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:projectId" element={<ProjectDetail />} />
          <Route path="projects/:projectId/tests/new" element={<CreateTest />} />
          <Route path="projects/:projectId/tests/:testId" element={<TestDetails />} />
          <Route path="projects/:projectId/tests/:testId/run" element={<CreateRun />} />
          <Route path="projects/:projectId/tests/:testId/runs/:runId" element={<RunLive />} />
          <Route path="frameworks" element={<Frameworks />} />
          <Route path="frameworks/:fwId" element={<FrameworkDetail />} />
          <Route path="active" element={<ActiveRuns />} />
          <Route path="agents" element={<Agents />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
