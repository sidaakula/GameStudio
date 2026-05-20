using Microsoft.AspNetCore.Mvc;
using GameWorld.Api.Models;
using GameWorld.Api.Services;

namespace GameWorld.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TriviaController : ControllerBase
    {
        private readonly IAIService _aiService;
        private readonly ILogger<TriviaController> _logger;

        public TriviaController(IAIService aiService, ILogger<TriviaController> logger)
        {
            _aiService = aiService;
            _logger = logger;
        }

        // GET: api/trivia/questions?topic=pokemon&age=10
        [HttpGet("questions")]
        public async Task<ActionResult<TriviaChallenge>> GetQuestions([FromQuery] string topic = "pokemon", [FromQuery] int age = 10)
        {
            _logger.LogInformation("Request received for Trivia questions. Topic: {Topic}, Age: {Age}", topic, age);
            
            if (string.IsNullOrWhiteSpace(topic))
            {
                return BadRequest("Topic cannot be empty.");
            }

            if (age < 1 || age > 120)
            {
                return BadRequest("Age must be between 1 and 120.");
            }

            try
            {
                var challenge = await _aiService.GenerateTriviaChallengeAsync(topic, age);
                return Ok(challenge);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate trivia challenge.");
                return StatusCode(500, "Internal server error while generating trivia challenge.");
            }
        }
    }
}
