using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using GameWorld.Api.Data;
using GameWorld.Api.Models;

namespace GameWorld.Api.Controllers
{
    public class CommonLeaderboardRow
    {
        public string PlayerName { get; set; } = string.Empty;
        public int CatchTheRobots { get; set; }
        public int RoadSafetyQuiz { get; set; }
        public int FamilyTreeQuest { get; set; }
        public int MainframeOverride { get; set; }
        public int TriviaAI { get; set; }
        public int TotalScore { get; set; }
    }

    [ApiController]
    [Route("api/[controller]")]
    public class LeaderboardController : ControllerBase
    {
        private readonly GameDbContext _context;

        public LeaderboardController(GameDbContext context)
        {
            _context = context;
        }

        // GET: api/leaderboard/common
        [HttpGet("common")]
        public async Task<ActionResult<IEnumerable<CommonLeaderboardRow>>> GetCommonLeaderboard()
        {
            var scores = await _context.GameScores.ToListAsync();
            
            var rows = scores
                .GroupBy(s => s.PlayerName.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(g =>
                {
                    var catchRobots = g.Where(s => s.GameName.Equals("CatchTheRobots", StringComparison.OrdinalIgnoreCase)).Max(s => (int?)s.Score) ?? 0;
                    var roadSafety = g.Where(s => s.GameName.Equals("RoadSafetyQuiz", StringComparison.OrdinalIgnoreCase)).Max(s => (int?)s.Score) ?? 0;
                    var familyTree = g.Where(s => s.GameName.Equals("FamilyTreeQuest", StringComparison.OrdinalIgnoreCase)).Max(s => (int?)s.Score) ?? 0;
                    var mainframe = g.Where(s => s.GameName.Equals("MainframeOverride", StringComparison.OrdinalIgnoreCase)).Max(s => (int?)s.Score) ?? 0;
                    var trivia = g.Where(s => s.GameName.Equals("TriviaAI", StringComparison.OrdinalIgnoreCase)).Max(s => (int?)s.Score) ?? 0;
                    
                    return new CommonLeaderboardRow
                    {
                        PlayerName = g.Key,
                        CatchTheRobots = catchRobots,
                        RoadSafetyQuiz = roadSafety,
                        FamilyTreeQuest = familyTree,
                        MainframeOverride = mainframe,
                        TriviaAI = trivia,
                        TotalScore = catchRobots + roadSafety + familyTree + mainframe + trivia
                    };
                })
                .OrderByDescending(r => r.TotalScore)
                .ToList();

            return rows;
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
