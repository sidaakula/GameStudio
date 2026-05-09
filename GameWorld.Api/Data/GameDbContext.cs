using Microsoft.EntityFrameworkCore;
using GameWorld.Api.Models;

namespace GameWorld.Api.Data
{
    public class GameDbContext : DbContext
    {
        public GameDbContext(DbContextOptions<GameDbContext> options) : base(options) { }

        public DbSet<GameScore> GameScores { get; set; }
    }
}
