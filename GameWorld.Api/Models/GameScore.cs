using System;

namespace GameWorld.Api.Models
{
    public class GameScore
    {
        public int Id { get; set; }
        public string GameName { get; set; } = string.Empty; // e.g., "CatchTheRobots", "RoadSafetyQuiz"
        public string PlayerName { get; set; } = string.Empty;
        public int Score { get; set; }
        public DateTime AchievedAt { get; set; } = DateTime.UtcNow;
    }
}
