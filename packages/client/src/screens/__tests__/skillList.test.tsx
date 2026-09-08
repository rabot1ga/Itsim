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

describe('compact skill list', () => {
  it('shows all missing prerequisites, including unknown prerequisite names', () => {
    expect(missingRequirements(skills[1]!, { javascript: { level: 24, xp: 0 } }, skills)).toEqual([
      'JavaScript: ур. 25 (сейчас 24)',
      'git: ур. 5 (сейчас 0)',
    ]);
  });
  it('selects an available skill and does not select a locked skill', () => {
    const pick = vi.fn();
    render(<SkillList skills={skills} levels={{}} busy={false} onPick={pick} />);
    fireEvent.click(within(screen.getByRole('article', { name: 'Python' })).getByRole('button'));
    expect(pick).toHaveBeenCalledWith('python');
    const locked = within(screen.getByRole('article', { name: 'React' })).getByRole('button');
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(locked);
    expect(pick).toHaveBeenCalledTimes(1);
  });
  it('filters by name and branch and can reset an empty result', () => {
    render(<SkillList skills={skills} levels={{}} busy={false} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText('Найти навык'), { target: { value: ' PYTHON ' } });
    expect(screen.getAllByRole('article')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Направление'), { target: { value: 'frontend' } });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
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
    expect(screen.getByRole('progressbar', { name: 'Прогресс JavaScript' }).getAttribute('aria-valuenow')).toBe('3');
    expect(screen.getByRole('progressbar', { name: 'Прогресс JavaScript' }).getAttribute('aria-valuemax')).toBe('8');
    expect(screen.getByRole('progressbar', { name: 'Прогресс Python' }).getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('Максимальный уровень')).toBeTruthy();
  });
  it('keeps the initial list short without hiding the rest of the catalogue', () => {
    const catalogue = Array.from({ length: 10 }, (_, i) => ({ ...skills[0]!, id: `skill_${i}`, name: `Навык ${i}` }));
    render(<SkillList skills={catalogue} levels={{}} busy={false} onPick={() => {}} />);
    expect(screen.getAllByRole('article')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Показать все 10 навыков' }));
    expect(screen.getAllByRole('article')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть список' }));
    expect(screen.getAllByRole('article')).toHaveLength(8);
  });

  it('marks the primary skill and disables selection while a request is pending', () => {
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
    expect(screen.getByRole('button', { name: 'Основной навык' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Веха пути · цель: ур. 30')).toBeTruthy();
    expect(screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
  });
});
