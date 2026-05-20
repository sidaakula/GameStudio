using Microsoft.AspNetCore.SignalR;
using GameWorld.Api.Models;
using GameWorld.Api.Services;
using System.Collections.Concurrent;

namespace GameWorld.Api.Hubs;

public class MainframeHub(IAIService aiService, ILogger<MainframeHub> logger) : Hub
{
    private static readonly ConcurrentDictionary<string, GameSession> Sessions = new();

    public async Task StartGame(string playerName, int age)
    {
        logger.LogInformation("Starting game for {PlayerName} (Age: {Age})", playerName, age);
        
        await Clients.Caller.SendAsync("SystemStatus", "Initializing override sequence...");
        
        var challenge = await aiService.GenerateChallengeAsync(age);
        
        var session = new GameSession(
            Context.ConnectionId,
            playerName,
            challenge.Riddles,
            0,
            DateTime.UtcNow
        );

        Sessions[Context.ConnectionId] = session;

        await Clients.Caller.SendAsync("GameStarted", new {
            totalRiddles = challenge.Riddles.Count,
            timeLimit = session.TimeLimitSeconds
        });

        await SendNextRiddle(session);
    }

    public async Task SubmitAnswer(string answer)
    {
        try
        {
            if (!Sessions.TryGetValue(Context.ConnectionId, out var session))
            {
                logger.LogWarning("No session found for {ConnectionId}", Context.ConnectionId);
                await Clients.Caller.SendAsync("Error", "No active session found.");
                return;
            }

            var currentRiddle = session.Riddles[session.CurrentRiddleIndex];
            logger.LogInformation("Answer submitted: '{Answer}', Expected: '{Expected}'", answer, currentRiddle.Answer);
            bool isCorrect = string.Equals(currentRiddle.Answer.Trim(), answer.Trim(), StringComparison.OrdinalIgnoreCase);

            if (isCorrect)
            {
                var nextIndex = session.CurrentRiddleIndex + 1;
                if (nextIndex < session.Riddles.Count)
                {
                    var updatedSession = session with { CurrentRiddleIndex = nextIndex };
                    Sessions[Context.ConnectionId] = updatedSession;
                    await Clients.Caller.SendAsync("AnswerResult", true, "Security layer bypassed!");
                    await SendNextRiddle(updatedSession);
                }
                else
                {
                    var timeTaken = (DateTime.UtcNow - session.StartTime).TotalSeconds;
                    await Clients.Caller.SendAsync("Victory", new {
                        message = "MAINFRAME OVERRIDDEN! SYSTEM SECURED.",
                        timeTaken = Math.Round(timeTaken, 2)
                    });
                    Sessions.TryRemove(Context.ConnectionId, out _);
                }
            }
            else
            {
                await Clients.Caller.SendAsync("AnswerResult", false, "ACCESS DENIED. Try again.");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error in SubmitAnswer");
            await Clients.Caller.SendAsync("Error", "Internal system failure.");
        }
    }

    private async Task SendNextRiddle(GameSession session)
    {
        var riddle = session.Riddles[session.CurrentRiddleIndex];
        await Clients.Caller.SendAsync("NextRiddle", new {
            index = session.CurrentRiddleIndex + 1,
            question = riddle.Question,
            hint = riddle.Hint,
            visualizationType = riddle.VisualizationType,
            visualizationData = riddle.VisualizationData
        });
    }

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("SignalR Connection Started: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        logger.LogInformation("SignalR Connection Ended: {ConnectionId}. Error: {Error}", Context.ConnectionId, exception?.Message);
        Sessions.TryRemove(Context.ConnectionId, out _);
        await base.OnDisconnectedAsync(exception);
    }
}
