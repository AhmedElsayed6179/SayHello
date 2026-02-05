import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class WebOnlyGuard implements CanActivate {

  constructor(private router: Router) {}

  canActivate(): boolean {
    const ua = navigator.userAgent || navigator.vendor || '';

    const isFromApk =
      /wv/i.test(ua) ||
      /Version\/[\d.]+.*Chrome/i.test(ua) ||
      /Median/i.test(ua) ||
      (window as any).cordova !== undefined ||
      (window as any).Capacitor !== undefined;

    const isMobile = /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua);

    if (!isMobile || isFromApk) {
      this.router.navigate(['/Home']);
      return false;
    }

    return true;
  }
}

