import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { UserService } from '../../shared/user.service';

// Declare types for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

@Component({
  selector: 'app-mainframe-override',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './mainframe-override.html',
  styleUrls: ['./mainframe-override.css']
})
export class MainframeOverride implements OnInit, OnDestroy {
  @ViewChild('answerInput') answerInput!: ElementRef<HTMLInputElement>;
  
  constructor(private cdr: ChangeDetectorRef, private userService: UserService) {}

  private hubConnection!: HubConnection;
  
  gameState: 'intro' | 'playing' | 'victory' | 'failure' = 'intro';
  timeLeft = 60;
  timerInterval: any;
  
  currentRiddleIndex = 0;
  totalRiddles = 0;
  currentQuestion = '';
  currentHint = '';
  showHint = false;
  userAnswer = '';
  statusMessage = '';
  visualizationType: string | null = null;
  visualizationData: string[] = [];
  isSubmitting = false;
  isRogueAngry = false;
  resultData: any = {};
  connectionState = HubConnectionState.Disconnected;
  HubConnectionState = HubConnectionState;
  isStarting = false;
  isConnected = false;
  playerAge = 7;
  
  // Speech Recognition
  isListening = false;
  speechRecognition: any = null;
  hasSpeechSupport = false;

  ngOnInit() {
    this.initSignalR();
    this.initSpeechRecognition();
  }

  ngOnDestroy() {
    this.stopTimer();
    this.stopListening();
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }

  private initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.hasSpeechSupport = true;
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;
      this.speechRecognition.lang = 'en-US';

      this.speechRecognition.onstart = () => {
        this.isListening = true;
        this.cdr.detectChanges();
      };

      this.speechRecognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.userAnswer = transcript;
        this.cdr.detectChanges();
        // Give a tiny delay for the user to see what was captured before submitting
        setTimeout(() => {
          this.submitAnswer();
        }, 800);
      };

      this.speechRecognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        this.isListening = false;
        if (event.error === 'not-allowed') {
          this.statusMessage = 'Microphone access denied.';
        } else {
          this.statusMessage = 'Voice input error. Please try typing.';
        }
        this.cdr.detectChanges();
      };

      this.speechRecognition.onend = () => {
        this.isListening = false;
        this.cdr.detectChanges();
      };
    }
  }

  toggleListening() {
    if (!this.hasSpeechSupport || !this.speechRecognition) {
      this.statusMessage = 'Voice input not supported in this browser.';
      return;
    }

    if (this.isListening) {
      this.stopListening();
    } else {
      try {
        this.speechRecognition.start();
      } catch (e) {
        console.error('Speech recognition start error', e);
      }
    }
  }

  private stopListening() {
    if (this.speechRecognition && this.isListening) {
      try {
        this.speechRecognition.stop();
      } catch (e) {
        console.error('Speech recognition stop error', e);
      }
      this.isListening = false;
    }
  }

  private initSignalR() {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl('/hubs/mainframe')
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('SystemStatus', (msg: string) => {
      this.statusMessage = msg;
      this.cdr.detectChanges();
    });

    this.hubConnection.on('GameStarted', (data: any) => {
      this.isStarting = false;
      this.totalRiddles = data.totalRiddles;
      this.timeLeft = data.timeLimit;
      this.gameState = 'playing';
      this.startTimer();
      this.cdr.detectChanges();
    });

    this.hubConnection.on('NextRiddle', (data: any) => {
      this.currentRiddleIndex = data.index;
      this.currentQuestion = data.question;
      this.currentHint = data.hint;
      this.visualizationType = data.visualizationType;
      this.visualizationData = data.visualizationData || [];
      this.userAnswer = '';
      this.isSubmitting = false;
      this.isRogueAngry = false;
      this.showHint = false;
      
      // Auto focus input
      setTimeout(() => this.answerInput?.nativeElement?.focus(), 100);
      this.readQuestion(data.question);
      this.cdr.detectChanges();
    });

    this.hubConnection.on('AnswerResult', (isCorrect: boolean, msg: string) => {
      this.statusMessage = msg;
      this.isSubmitting = false; // Always reset here
      if (!isCorrect) {
        this.isRogueAngry = true;
        setTimeout(() => this.isRogueAngry = false, 2000);
      }
      this.readQuestion(msg);
      this.cdr.detectChanges();
    });

    this.hubConnection.on('Victory', (data: any) => {
      this.stopTimer();
      this.gameState = 'victory';
      this.resultData = data;
      this.isSubmitting = false;
      this.readQuestion(data.message);
      this.submitScore();
      this.cdr.detectChanges();
    });

    this.hubConnection.on('Error', (err: string) => {
      this.statusMessage = `ERROR: ${err}`;
      this.isSubmitting = false;
      this.isStarting = false;
      this.cdr.detectChanges();
    });

    this.hubConnection.onreconnecting(() => {
      this.connectionState = HubConnectionState.Reconnecting;
      this.isConnected = false;
      this.statusMessage = 'SYSTEM ALERT: Connection unstable. Reconnecting...';
      this.cdr.detectChanges();
    });

    this.hubConnection.onreconnected(() => {
      this.connectionState = HubConnectionState.Connected;
      this.isConnected = true;
      this.statusMessage = 'SYSTEM RESTORED: Connection re-established.';
      this.cdr.detectChanges();
    });

    this.hubConnection.onclose(() => {
      this.connectionState = HubConnectionState.Disconnected;
      this.isConnected = false;
      this.statusMessage = 'SYSTEM FAILURE: Connection lost. Please refresh.';
      this.cdr.detectChanges();
    });

    this.hubConnection.start()
      .then(() => {
        this.connectionState = HubConnectionState.Connected;
        this.isConnected = true;
        console.log('SignalR connected');
        this.cdr.detectChanges();
      })
      .catch((err: any) => {
        this.connectionState = HubConnectionState.Disconnected;
        this.isConnected = false;
        console.error('SignalR error:', err);
        this.cdr.detectChanges();
      });
  }

  startGame() {
    if (this.isStarting || !this.isConnected) {
      this.statusMessage = 'ERROR: Mainframe link down or busy.';
      return;
    }
    this.isStarting = true;
    this.hubConnection.invoke('StartGame', 'Agent-Child', this.playerAge);
  }

  submitAnswer() {
    if (!this.userAnswer || this.isSubmitting) return;
    
    this.stopListening();
    
    if (!this.isConnected) {
      this.statusMessage = 'ERROR: Link down. Cannot transmit.';
      return;
    }

    this.isSubmitting = true;
    this.hubConnection.invoke('SubmitAnswer', this.userAnswer);
  }

  resetGame() {
    this.gameState = 'intro';
    this.timeLeft = 60;
    this.currentRiddleIndex = 0;
    this.statusMessage = '';
    this.userAnswer = '';
    this.stopListening();
  }

  private startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.endGame(false);
      }
      if (this.timeLeft === 30) {
        this.showHint = true;
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  private endGame(victory: boolean) {
    this.stopTimer();
    this.gameState = victory ? 'victory' : 'failure';
    this.readQuestion(victory ? 'System secured. Access granted.' : 'Access denied. Core lock down.');
  }

  private readQuestion(text: string) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }

  async submitScore() {
    const playerName = this.userService.getUsername();
    if (!playerName) return;
    
    // Score is based on time left
    const score = this.timeLeft * 10;

    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: 'MainframeOverride',
          playerName: playerName,
          score: score
        })
      });
    } catch (err) {
      console.error('Failed to submit score', err);
    }
  }
}
