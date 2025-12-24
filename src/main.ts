import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import "bootstrap/dist/js/bootstrap.bundle.min.js"
import 'emoji-picker-element'

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
