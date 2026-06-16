import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { WorkflowNode } from './WorkflowNode';

describe('WorkflowNode Component', () => {
  it('renders correctly with provided node data', () => {
    const mockData = {
      id: 'TEST-NODE-01',
      seq: 1,
      title: 'KYC Verification Step',
      slaDays: 3
    };

    render(
      <ReactFlowProvider>
        <WorkflowNode data={mockData} selected={false} />
      </ReactFlowProvider>
    );

    expect(screen.getByText('SEQUENCE #1')).toBeInTheDocument();
    expect(screen.getByText('TEST-NODE-01')).toBeInTheDocument();
    expect(screen.getByText('KYC Verification Step')).toBeInTheDocument();
    expect(screen.getByText('SLA: 3 Days')).toBeInTheDocument();
  });

  it('applies the correct styling when selected', () => {
    const mockData = {
      id: 'TEST-NODE-02',
      seq: 2,
      title: 'Approval Node',
      slaDays: 1
    };

    const { container } = render(
      <ReactFlowProvider>
        <WorkflowNode data={mockData} selected={true} />
      </ReactFlowProvider>
    );

    expect(container.firstChild).toHaveClass('border-blue-600');
  });
});