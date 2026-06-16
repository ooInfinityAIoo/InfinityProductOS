import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MasterHeaderNav } from './MasterHeaderNav';
import { usePlatformStore } from '../store/usePlatformStore';
import { useQuery } from '@tanstack/react-query';

// Mock our global state and data fetching dependencies
jest.mock('../store/usePlatformStore');
jest.mock('@tanstack/react-query');
jest.mock('../api/client', () => ({
  apiClient: { get: jest.fn() }
}));

describe('MasterHeaderNav Component', () => {
  const mockSetActiveModule = jest.fn();
  const mockSetWizardOpen = jest.fn();
  const mockSetProductContext = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Zustand store returns
    (usePlatformStore as unknown as jest.Mock).mockReturnValue({
      activeProductContext: null,
      setActiveModule: mockSetActiveModule,
      setWizardOpen: mockSetWizardOpen,
      setProductContext: mockSetProductContext
    });

    // Mock React Query returns
    (useQuery as jest.Mock).mockReturnValue({
      data: { brand_name: 'Infinity Demo Bank', logo_url: null }
    });
  });

  it('renders the dynamic brand name from the theme query', () => {
    render(<MasterHeaderNav />);
    expect(screen.getByText('Infinity Demo Bank')).toBeInTheDocument();
  });

  it('dispatches setActiveModule when a studio navigation button is clicked', () => {
    render(<MasterHeaderNav />);
    
    const rulesEngineBtn = screen.getByText('Rules Engine');
    fireEvent.click(rulesEngineBtn);
    
    expect(mockSetActiveModule).toHaveBeenCalledWith('business-rules');
  });

  it('opens the package initialization wizard when configuring a new product', () => {
    render(<MasterHeaderNav />);
    const startBtn = screen.getByText('+ Start Configuring New Product');
    fireEvent.click(startBtn);
    expect(mockSetWizardOpen).toHaveBeenCalledWith(true);
  });
});