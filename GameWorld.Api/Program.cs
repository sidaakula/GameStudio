using Microsoft.EntityFrameworkCore;
using GameWorld.Api.Data;
using GameWorld.Api.Hubs;
using GameWorld.Api.Services;
using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.Connectors.Google;
using Microsoft.SemanticKernel.Connectors.OpenAI;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddSignalR(options =>
{
    options.ClientTimeoutInterval = TimeSpan.FromMinutes(5);
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.HandshakeTimeout = TimeSpan.FromSeconds(60);
});
builder.Services.AddScoped<IAIService, AIService>();

builder.Services.AddSingleton<Kernel>(sp => 
{
    var config = sp.GetRequiredService<IConfiguration>();
    var kernelBuilder = Kernel.CreateBuilder();

    // 1. Register Gemini
    var geminiKey = config["Gemini:ApiKey"] ?? string.Empty;
    var geminiModel = config["Gemini:ModelId"] ?? "gemini-1.5-flash";

    #pragma warning disable SKEXP0070
    kernelBuilder.AddGoogleAIGeminiChatCompletion(
        modelId: geminiModel,
        apiKey: geminiKey,
        serviceId: "Gemini"
    );
    #pragma warning restore SKEXP0070

    // 2. Register Ollama (Llama/Gemma)
    var ollamaEndpoint = config["Ollama:Endpoint"] ?? "http://localhost:11434/v1";
    var ollamaModel = config["Ollama:ModelId"] ?? "llama3.2:3b";
    
    #pragma warning disable SKEXP0010
    kernelBuilder.AddOpenAIChatCompletion(
        modelId: ollamaModel,
        apiKey: "ollama", // Required but ignored by Ollama
        endpoint: new Uri(ollamaEndpoint),
        serviceId: "Ollama"
    );
    #pragma warning restore SKEXP0010

    return kernelBuilder.Build();
});

// Configure Entity Framework with SQLite
builder.Services.AddDbContext<GameDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=gameworld.db"));

// Configure CORS for Angular frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngular",
        policy =>
        {
            policy.WithOrigins("http://localhost:4200")
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials(); // Required for SignalR
        });
});

// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

// Create database if it doesn't exist
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<GameDbContext>();
    context.Database.EnsureCreated();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseCors("AllowAngular");

app.UseAuthorization();

app.MapControllers();
app.MapHub<MainframeHub>("/hubs/mainframe");

app.Run();
