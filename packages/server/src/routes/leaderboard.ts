import { FastifyInstance } from 'fastify';

export async function leaderboardRoutes(app: FastifyInstance) {
  /**
   * GET /api/leaderboard/friends
   * Friends leaderboard (cached)
   */
  app.get('/friends', async (request, reply) => {
    // For MVP — return mock data
    return {
      leaderboard: [
        { rank: 1, name: 'Алексей', grade: 'senior', rating: 850 },
        { rank: 2, name: 'Мария', grade: 'middle', rating: 620 },
        { rank: 3, name: 'Пользователь', grade: 'junior', rating: 340, isYou: true },
        { rank: 4, name: 'Дмитрий', grade: 'junior', rating: 280 },
        { rank: 5, name: 'Елена', grade: 'intern', rating: 150 },
      ],
      updatedAt: Date.now(),
    };
  });

  /**
   * GET /api/leaderboard/honest
   * Honest mode leaderboard (no boosters)
   */
  app.get('/honest', async (request, reply) => {
    return {
      leaderboard: [],
      updatedAt: Date.now(),
    };
  });
}