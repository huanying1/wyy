import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  forwardRef,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  ViewEncapsulation,
  EventEmitter,
} from '@angular/core';
import {fromEvent, Observable, merge, Subscription} from "rxjs";
import {distinctUntilChanged, filter, map, pluck, takeUntil, tap} from "rxjs/operators";
import {SliderEventObserverConfig, SliderValue} from "./wy-slider-types";
import {DOCUMENT} from "@angular/common";
import {getElementOffset, sliderEvent} from "./wy-slider-helper";
import {inArray} from "../../../utils/array";
import {getPercent, limitNumberInRange} from "../../../utils/number";
import {ControlValueAccessor, NG_VALUE_ACCESSOR} from "@angular/forms";

@Component({
  selector: 'app-wy-slider',
  templateUrl: './wy-slider.component.html',
  styleUrls: ['./wy-slider.component.less'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => WySliderComponent),
      multi: true
    }
  ]
})
export class WySliderComponent implements OnInit, OnDestroy, ControlValueAccessor {
  @Input() wyVertical = false
  @Input() wyMin = 0
  @Input() wyMax = 100
  @Input() bufferPercent: SliderValue = 0
  @Output() wyOnAfterChange = new EventEmitter<SliderValue>()

  @ViewChild('wySlider', {static: true}) private wySlider: ElementRef
  private sliderDom: HTMLDivElement

  private dragStart$: Observable<number>
  private dragMove$: Observable<number>
  private dragEnd$: Observable<Event>
  private dragStart_: Subscription | null
  private dragMove_: Subscription | null
  private dragEnd_: Subscription | null

  private isDragging = false

  value: SliderValue
  offset = null

  constructor(
    @Inject(DOCUMENT) private doc: Document,
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit(): void {
    this.sliderDom = this.wySlider.nativeElement
    this.createDraggingObservable()
    this.subscribeDrag(['start'])
  }

  private createDraggingObservable() {

    const orientField = this.wyVertical ? 'pageY' : 'pageX'

    const mouse: SliderEventObserverConfig = {
      start: 'mousedown',
      move: 'mousemove',
      end: 'mouseup',
      filterEvent: (e: MouseEvent) => e instanceof MouseEvent,
      pluckKey: [orientField]
    };
    const touch: SliderEventObserverConfig = {
      start: 'touchstart',
      move: 'touchmove',
      end: 'touchend',
      filterEvent: (e: TouchEvent) => e instanceof TouchEvent,
      pluckKey: ['touches', '0', orientField]
    };

    [mouse, touch].forEach(source => {
      const {start, move, end, filterEvent, pluckKey} = source
      source.startPlucked$ = fromEvent(this.sliderDom, start)
        .pipe(
          filter(filterEvent),
          tap(sliderEvent),
          pluck(...pluckKey),
          map((position: number) => this.findClosestValue(position))
        )
      source.end$ = fromEvent(this.doc, end);
      source.moveResolved$ = fromEvent(this.doc, move)
        .pipe(
          filter(filterEvent),
          tap(sliderEvent),
          pluck(...pluckKey),
          distinctUntilChanged(),
          map((position: number) => this.findClosestValue(position)),
          takeUntil(source.end$)
        )
    })

    this.dragStart$ = merge(mouse.startPlucked$, touch.startPlucked$)
    this.dragMove$ = merge(mouse.moveResolved$, touch.moveResolved$)
    this.dragEnd$ = merge(mouse.end$, touch.end$)

  }

  private findClosestValue(position: number): number {
    //获取滑块总长
    const sliderLength = this.getSliderLength()
    //获取(左,上)端点位置
    const sliderStart = this.getSliderStartPosition()
    //滑块当前位置 / 滑块总长
    const ratio = limitNumberInRange((position - sliderStart) / sliderLength, 0, 1)
    const ratioTrue = this.wyVertical ? 1 - ratio : ratio
    return ratioTrue * (this.wyMax - this.wyMin) + this.wyMin
  }

  private getSliderLength(): number {
    return this.wyVertical ? this.sliderDom.clientHeight : this.sliderDom.clientWidth
  }

  private getSliderStartPosition(): number {
    const offset = getElementOffset(this.sliderDom)
    return this.wyVertical ? offset.top : offset.left

  }

  private subscribeDrag(events: string[] = ['start', 'move', 'end']) {
    if (inArray(events, 'start') && this.dragStart$ && !this.dragStart_) {
      this.dragStart_ = this.dragStart$.subscribe(this.onDragStart.bind(this))
    }
    if (inArray(events, 'move') && this.dragMove$ && !this.dragMove_) {
      this.dragMove_ = this.dragMove$.subscribe(this.onDragMove.bind(this))
    }
    if (inArray(events, 'end') && this.dragEnd$ && !this.dragEnd_) {
      this.dragEnd_ = this.dragEnd$.subscribe(this.onDragEnd.bind(this))
    }
  }

  private unSubscribe(events: string[] = ['start', 'move', 'end']) {
    if (inArray(events, 'start') && this.dragStart_) {
      this.dragStart_.unsubscribe()
      this.dragStart_ = null
    }
    if (inArray(events, 'move') && this.dragMove_) {
      this.dragMove_.unsubscribe()
      this.dragMove_ = null
    }
    if (inArray(events, 'end') && this.dragEnd_) {
      this.dragEnd_.unsubscribe()
      this.dragEnd_ = null
    }
  }

  private onDragStart(value: number) {
    this.toggleDragMoving(true)
    this.setValue(value)
  }

  private onDragMove(value: SliderValue) {
    if (this.isDragging) {
      this.setValue(value)
      this.cdr.markForCheck()
    }
  }

  private setValue(value: number, needCheck = false) {
    if (needCheck) {
      if (!this.isDragging) return;
      this.value = this.formatValue(value)
      this.cdr.markForCheck()
    } else {
      if (!this.valueEqual(this.value, value)) {
        this.value = value
        this.updateTrackAndHandles()
        this.onValueChange(this.value)
      }
    }
  }

  formatValue(value: SliderValue): SliderValue {
    let res = value
    if (!this.assertValueValid(value)) {
      res = this.wyMin
    } else {
      res = limitNumberInRange(value, this.wyMin, this.wyMax)
    }
    return res
  }

  private assertValueValid(value: SliderValue): boolean {
    return isNaN(typeof value !== 'number' ? parseFloat(value) : value)
  }

  private valueEqual(valA: SliderValue, valB: SliderValue): boolean {
    if (typeof valA !== typeof valB) {
      return false
    }
    return valA === valB
  }

  private onDragEnd() {
    this.wyOnAfterChange.emit(this.value)
    this.toggleDragMoving(false)
    this.cdr.markForCheck()
  }

  private updateTrackAndHandles() {
    this.offset = this.getValueToOffset(this.value)
    this.cdr.markForCheck()
  }

  private getValueToOffset(value: SliderValue): SliderValue {
    return getPercent(value, this.wyMin, this.wyMax)
  }

  private toggleDragMoving(movable: boolean) {
    this.isDragging = movable
    if (movable) {
      this.subscribeDrag(['move', 'end'])
    } else {
      this.unSubscribe(['move', 'end'])
    }
  }

  ngOnDestroy(): void {
    this.unSubscribe()
  }

  private onValueChange(value: SliderValue): void {
  }

  private onTouched(): void {
  }

  registerOnChange(fn: (value: SliderValue) => void): void {
    this.onValueChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  writeValue(value: SliderValue): void {
    this.setValue(value)
  }

}

