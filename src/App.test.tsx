import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import { usePlatformStore } from './store/usePlatformStore';

// Mock the Zustand store
jest.mock('./store/usePlatformStore');

// Mock heavy child components to isolate the routing logic test
jest.mock('./layouts/MasterHeaderNav', () => ({ MasterHeaderNav: () => <div data-testid="nav-mock" /> }));
jest.mock('./features/dashboard/HomeDashboard', () => ({ HomeDashboard: () => <div data-testid="dashboard-mock" /> }));
jest.mock('./features/workflow-designer/WorkflowCanvas', () => ({ WorkflowCanvas: () => <div data-testid="workflow-mock" /> }));
jest.mock('./features/rules-designer/BusinessRulesStudio', () => ({ BusinessRulesStudio: () => <div data-testid="rules-mock" /> }));

describe('App Root Shell', () => {
  it('always renders the MasterHeaderNav', () => {
    (usePlatformStore as unknown as jest.Mock).mockReturnValue('dashboard');
    render(<App />);
    expect(screen.getByTestId('nav-mock')).toBeInTheDocument();
  });

  it('mounts the HomeDashboard when activeModule is set to dashboard', () => {
    (usePlatformStore as unknown as jest.Mock).mockReturnValue('dashboard');
    render(<App />);
    expect(screen.getByTestId('dashboard-mock')).toBeInTheDocument();
  });

  it('mounts the WorkflowCanvas when activeModule is set to workflow-designer', () => {
    (usePlatformStore as unknown as jest.Mock).mockReturnValue('workflow-designer');
    render(<App />);
    expect(screen.getByTestId('workflow-mock')).toBeInTheDocument();
  });

  it('mounts the BusinessRulesStudio when activeModule is set to business-rules', () => {
    (usePlatformStore as unknown as jest.Mock).mockReturnValue('business-rules');
    render(<App />);
    expect(screen.getByTestId('rules-mock')).toBeInTheDocument();
  });
});