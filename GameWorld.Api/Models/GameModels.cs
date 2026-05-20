using System.Text.Json.Serialization;

namespace GameWorld.Api.Models;

public record Riddle(
    [property: JsonPropertyName("question")] string Question,
    [property: JsonPropertyName("answer")] string Answer,
    [property: JsonPropertyName("hint")] string Hint,
    [property: JsonPropertyName("visualizationType")] string? VisualizationType = null,
    [property: JsonPropertyName("visualizationData")] string[]? VisualizationData = null
);

public record MainframeChallenge(
    [property: JsonPropertyName("riddles")] List<Riddle> Riddles
);

public record GameSession(
    string ConnectionId,
    string PlayerName,
    List<Riddle> Riddles,
    int CurrentRiddleIndex,
    DateTime StartTime,
    int TimeLimitSeconds = 60
);

public record TriviaQuestion(
    [property: JsonPropertyName("question")] string Question,
    [property: JsonPropertyName("answer")] string Answer,
    [property: JsonPropertyName("hint")] string Hint,
    [property: JsonPropertyName("options")] string[] Options
);

public record TriviaChallenge(
    [property: JsonPropertyName("questions")] List<TriviaQuestion> Questions
);
