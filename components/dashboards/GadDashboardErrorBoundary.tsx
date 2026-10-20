import React from 'react';
import { RefreshCw } from 'lucide-react';

export default class GadDashboardErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
    declare readonly props: React.PropsWithChildren;
    declare setState: React.Component<React.PropsWithChildren, { failed: boolean }>['setState'];
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Unable to render the GAD dashboard:', error, info.componentStack);
    }

    render() {
        if (this.state.failed) return (
            <div className="notice notice--warning" role="alert">
                <p>Unable to display the GAD dashboard.</p>
                <button className="btn btn-secondary" type="button" onClick={() => this.setState({ failed: false })}>
                    <RefreshCw size={16} aria-hidden="true" />Retry
                </button>
            </div>
        );
        return this.props.children;
    }
}
