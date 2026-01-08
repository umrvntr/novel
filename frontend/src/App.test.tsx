import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

// Mock dependencies
vi.mock('./gameScript', () => ({
    GAME_CONFIG: { speaker: { name: 'CIPHER' } }
}));

describe('App', () => {
    it('renders without crashing', () => {
        render(<App />);
        expect(screen.getByText(/NEURAL_LINK/i)).toBeInTheDocument();
    });
});
