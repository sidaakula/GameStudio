using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using GameWorld.Api.Data;
using GameWorld.Api.Models;

namespace GameWorld.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class LeaderboardController : ControllerBase
    {
        private readonly GameDbContext _context;

        public LeaderboardController(GameDbContext context)
        {
            _context = context;
        }

        // GET: api/leaderboard/{gameName}
        [HttpGet("{gameName}")]
        public async Task<ActionResult<IEnumerable<GameScore>>> GetTopScores(string gameName, [FromQuery] int limit = 10)
        {
            return await _context.GameScores
                .Where(s => s.GameName.ToLower() == gameName.ToLower())
                .OrderByDescending(s => s.Score)
                .Take(limit)
                .ToListAsync();
        }

        // POST: api/leaderboard
        [HttpPost]
        public async Task<ActionResult<GameScore>> PostScore(GameScore score)
        {
            score.AchievedAt = DateTime.UtcNow;
            _context.GameScores.Add(score);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetTopScores), new { gameName = score.GameName }, score);
        }
    }
}
