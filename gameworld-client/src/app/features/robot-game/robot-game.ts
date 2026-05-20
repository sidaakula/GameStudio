import { Component, ElementRef, OnInit, ViewChild, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { UserService } from '../../shared/user.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

interface FallingObject {
  x: number;
  y: number;
  radius: number;
  color: string;
  speed: number;
  type: 'normal' | 'golden';
}

@Component({
  selector: 'app-robot-game',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './robot-game.html',
  styleUrls: ['./robot-game.css']
})
export class RobotGame implements AfterViewInit, OnDestroy {
  @ViewChild('webcam') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('gameCanvas') canvasElement!: ElementRef<HTMLCanvasElement>;
  
  gameState: 'start' | 'countdown' | 'playing' | 'gameover' = 'start';
  score = 0;
  timeLeft = 45;
  countdownValue = 3;
  errorMessage: string = '';
  
  private handLandmarker!: HandLandmarker;
  webcamRunning = false;
  private canvasCtx!: CanvasRenderingContext2D;
  private fallingObjects: FallingObject[] = [];
  private animationFrameId: number = 0;
  private timerInterval: any;
  private lastVideoTime = -1;

  constructor(private cdr: ChangeDetectorRef, private userService: UserService) {}

  async ngAfterViewInit() {
    this.canvasCtx = this.canvasElement.nativeElement.getContext('2d')!;
    await this.initializeHandTracking();
    this.startWebcam();
  }

  ngOnDestroy() {
    this.stopGame();
    if (this.videoElement?.nativeElement?.srcObject) {
      const stream = this.videoElement.nativeElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async initializeHandTracking() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
  }

  async startWebcam() {
    const video = this.videoElement.nativeElement;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      video.addEventListener("loadeddata", () => {
        this.webcamRunning = true;
        this.canvasElement.nativeElement.width = video.videoWidth;
        this.canvasElement.nativeElement.height = video.videoHeight;
        this.cdr.detectChanges();
        this.predictWebcam();
      });
      // Fallback in case loadeddata already fired or doesn't fire
      if (video.readyState >= 2) {
        this.webcamRunning = true;
        this.canvasElement.nativeElement.width = video.videoWidth;
        this.canvasElement.nativeElement.height = video.videoHeight;
        this.cdr.detectChanges();
        this.predictWebcam();
      }
    } catch (err: any) {
      console.error("Error accessing webcam:", err);
      this.errorMessage = "Error accessing webcam: " + (err.message || err);
    }
  }

  startGame() {
    if (!this.webcamRunning) {
      this.errorMessage = "Please allow webcam access and wait for it to load before starting.";
      return;
    }
    
    this.errorMessage = '';
    this.gameState = 'countdown';
    this.score = 0;
    this.timeLeft = 45;
    this.countdownValue = 3;
    this.fallingObjects = [];
    
    const countInterval = setInterval(() => {
      this.countdownValue--;
      this.cdr.detectChanges();
      if (this.countdownValue === 0) {
        clearInterval(countInterval);
        this.gameState = 'playing';
        this.startTimer();
      }
    }, 1000);
  }

  startTimer() {
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.cdr.detectChanges();
      if (this.timeLeft <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  endGame() {
    clearInterval(this.timerInterval);
    this.gameState = 'gameover';
    this.submitScore();
  }

  stopGame() {
    cancelAnimationFrame(this.animationFrameId);
    clearInterval(this.timerInterval);
  }

  predictWebcam = async () => {
    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    
    if (this.webcamRunning && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      
      let results = undefined;
      if (this.handLandmarker) {
        results = this.handLandmarker.detectForVideo(video, performance.now());
      }

      this.canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (this.gameState === 'playing') {
        this.spawnObjects(canvas.width);
        this.updateAndDrawObjects(canvas.height);
      }

      if (results && results.landmarks) {
        for (const landmarks of results.landmarks) {
          // Draw simple points for fingertips
          const fingertips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
          for (const index of fingertips) {
            const px = landmarks[index].x * canvas.width;
            const py = landmarks[index].y * canvas.height;
            
            // Draw spark
            this.canvasCtx.beginPath();
            this.canvasCtx.arc(this.canvasElement.nativeElement.width - px, py, 10, 0, 2 * Math.PI);
            this.canvasCtx.fillStyle = '#feca57';
            this.canvasCtx.fill();

            // Collision detection
            if (this.gameState === 'playing') {
              this.checkCollisions(px, py);
            }
          }
        }
      }
    }
    
    this.animationFrameId = requestAnimationFrame(this.predictWebcam);
  };

  spawnObjects(width: number) {
    if (Math.random() < 0.05) { // 5% chance per frame
      const isGolden = Math.random() < 0.05; // 5% chance of golden
      this.fallingObjects.push({
        x: Math.random() * width,
        y: -50,
        radius: isGolden ? 30 : 25,
        color: isGolden ? '#f1c40f' : '#bdc3c7',
        speed: Math.random() * 3 + 2,
        type: isGolden ? 'golden' : 'normal'
      });
    }
  }

  updateAndDrawObjects(height: number) {
    for (let i = this.fallingObjects.length - 1; i >= 0; i--) {
      const obj = this.fallingObjects[i];
      obj.y += obj.speed;

      // Draw
      this.canvasCtx.beginPath();
      this.canvasCtx.arc(obj.x, obj.y, obj.radius, 0, 2 * Math.PI);
      this.canvasCtx.fillStyle = obj.color;
      this.canvasCtx.fill();
      this.canvasCtx.strokeStyle = '#2c3e50';
      this.canvasCtx.stroke();

      // Remove if off screen
      if (obj.y > height + obj.radius) {
        this.fallingObjects.splice(i, 1);
      }
    }
  }

  checkCollisions(hx: number, hy: number) {
    // MediaPipe uses mirrored coordinates if the video is mirrored.
    // Our video is mirrored via CSS (`transform: scaleX(-1)`), 
    // so the landmark X needs to be mirrored to match the canvas drawing
    hx = this.canvasElement.nativeElement.width - hx;

    for (let i = this.fallingObjects.length - 1; i >= 0; i--) {
      const obj = this.fallingObjects[i];
      const dist = Math.hypot(hx - obj.x, hy - obj.y);
      
      if (dist < obj.radius + 10) { // 10 is fingertip radius
        // Catch!
        this.score += obj.type === 'golden' ? 20 : 10;
        this.fallingObjects.splice(i, 1);
        this.playCatchSound();
      }
    }
  }

  playCatchSound() {
    // Simple synth beep
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
  }

  async submitScore() {
    const playerName = this.userService.getUsername();
    if (!playerName) return;
    
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: 'CatchTheRobots',
          playerName: playerName,
          score: this.score
        })
      });
      // Optionally return to start or stay on gameover
    } catch (err) {
      console.error('Failed to submit score', err);
    }
  }
}
