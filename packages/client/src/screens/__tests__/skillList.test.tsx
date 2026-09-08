import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SkillList, missingRequirements, type SkillInfo } from '../SkillList';

const skills: SkillInfo[] = [
  { id: 'javascript', name: 'JavaScript', branch: 'frontend', maxLevel: 100, icon: '', flavor: '' },
  {
    id: 'react',
    name: 'React',
    branch: 'frontend',
    maxLevel: 100,
    icon: '',
    flavor: '',
    unlockAt: { javascript: 25, git: 5 },
  },
  { id: 'python', name: 'Python', branch: 'backend', maxLevel: 100, icon: '', flavor: '' },
];
afterEach(cleanup);

describe('skill list grouped by school', () => {
  it('shows all missing prerequisites, including unknown prerequisite names', () => {
    expect(missingRequirements(skills[1]!, { javascript: { level: 24, xp: 0 } }, skills)).toEqual([
      'JavaScript: ур. 25 (сейчас 24)',
      'git: ур. 5 (сейчас 0)',
    ]);
  });

  it('groups skills by school and opens the first accordion only', () => {
    render(<SkillList skills={skills} levels={{}} busy={false} onPick={() => {}} />);
    const frontend = screen.getByRole('button', { name: /Frontend/ });
    const backend = screen.getByRole('button', { name: /Backend/ });
    expect(frontend.getAttribute('aria-expanded')).toBe('true');
    expect(backend.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(backend);
    expect(backend.getAttribute('aria-expanded')).toBe('true');
    // The counter reads «изучено / всего» for the school.
    expect(within(frontend).getByText('0 / 2')).toBeTruthy();
  });

  it('selects an available skill and does not select a locked one', () => {
    const pick = vi.fn();
    render(<SkillList skills={skills} levels={{}} busy={false} onPick={pick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Python' }));
    expect(pick).toHaveBeenCalledWith('python');

    const locked = screen.getByRole('button', { name: 'React' });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Нужно: JavaScript: ур. 25 (сейчас 0) · git: ур. 5 (сейчас 0)')).toBeTruthy();
    fireEvent.click(locked);
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('shows real XP and a full progressbar at the content level cap', () => {
    render(
      <SkillList
        skills={skills}
        levels={{ javascript: { level: 0, xp: 3 }, python: { level: 100, xp: 0 } }}
        busy={false}
        onPick={() => {}}
      />
    );
    const js = screen.getByRole('progressbar', { name: 'Прогресс JavaScript' });
    expect(js.getAttribute('aria-valuenow')).toBe('3');
    expect(js.getAttribute('aria-valuemax')).toBe('8');
    const python = screen.getByRole('progressbar', { name: 'Прогресс Python' });
    expect(python.getAttribute('aria-valuenow')).toBe('100');
    expect(python.getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByText('максимум')).toBeTruthy();
  });

  it('marks the primary skill and blocks every row while a request is pending', () => {
    render(
      <SkillList
        skills={skills}
        levels={{}}
        mainSkillId="javascript"
        busy
        route={{ steps: [{ skillId: 'javascript', target: 30 }] }}
        onPick={() => {}}
      />
    );
    const main = screen.getByRole('button', { name: 'JavaScript' });
    expect(main.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('основной')).toBeTruthy();
    expect(screen.getByText('Веха пути · цель: ур. 30')).toBeTruthy();
    for (const name of ['JavaScript', 'React', 'Python']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
