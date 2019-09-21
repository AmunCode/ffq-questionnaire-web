import {Component, OnInit} from '@angular/core';
import { QuestionnaireValidatorService } from '../../services/questionnaire-validator/questionnaire-validator.service';
import {ActivatedRoute, Router} from '@angular/router';
import {ErrorDialogPopupComponent} from '../../components/error-dialog-popup/error-dialog-popup.component';
import {MatDialog} from '@angular/material';
import {FFQItem} from '../../models/ffqitem';
import {FoodItemService} from '../../services/food-item/food-item.service';
import {log} from 'util';
import {HttpErrorResponse} from '@angular/common/http';
import {QuestionnaireResponse} from '../../models/questionnaire-response';
import {Questionnaire} from '../../models/Questionnaire';
import {FFQItemCalcRequest} from '../../models/ffqitem-calc-request';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {ResultsPageComponent} from '../results-page/results-page.component';
import {FFQResult} from '../../models/FFQResult';
import {NutrientConstants} from '../../models/NutrientConstants';

@Component({
  selector: 'app-questionnaire-page',
  templateUrl: './questionnaire-page.component.html',
  styleUrls: ['./questionnaire-page.component.css']
})
export class QuestionnairePageComponent implements OnInit {

  TITLE = 'Food Frequency Questionnaire';
  MAIN_MESSAGE = 'In the last 7 days and nights, how many times did your baby eat or drink the following?\n' +
    'Include those foods and drinks given to the baby by you and others, such as grandparents, babysitters, etc.\n\n';
  INSTRUCTIONS_TITLE = 'Instructions: \n';
  BULLETED_INSTRUCTIONS = [
    'For each entry, enter the number of times a food was consumed by your baby and\n' +
    ' specify whether this was per week or per day.',
    'If your baby did not eat this food in the last week, close out the question block for that food.',
    'All open question blocks must be completely filled out before submitting the questionnaire.',
    'Click the submit button when finished.'
  ];
  id: string;
  questionnaire: QuestionnaireResponse;
  hideSecondaryItems = false;
  dataLoaded: Promise<boolean>;

  foodItems: FFQItem[] = [];

  constructor(public foodService: FoodItemService,
              public questService: QuestionnaireValidatorService,
              private activatedRoute: ActivatedRoute,
              private errorDialog: MatDialog,
              private submissionErrorDialog: MatDialog,
              private httpErrorDialog: MatDialog,
              private successDialog: MatDialog,
              private router: Router,
              private modalService: NgbModal) {}
  ngOnInit() {
    this.activatedRoute.paramMap.subscribe(params => {
        this.id = params.get('id');
        this.questService.getQuestionnaireId(this.id).subscribe((data: QuestionnaireResponse) => {
          this.questionnaire = data;
          if (data.exists) {
            if (data.submitted) {
              this.router.navigateByUrl('/');
              const dialogRef = this.errorDialog.open(ErrorDialogPopupComponent);
              dialogRef.componentInstance.title = 'Questionnaire Already Submitted';
              dialogRef.componentInstance.message = 'Please check the ID and try again or contact the issuer.';
            }
          } else {
            this.router.navigateByUrl('/');
            const dialogRef = this.errorDialog.open(ErrorDialogPopupComponent);
            dialogRef.componentInstance.title = 'Invalid Questionnaire Id';
            dialogRef.componentInstance.message = 'Please check the ID and try again or contact the issuer.';
          }
      }, (error: Error) => this.handleQuestionnaireError(error));
      });
    this.loadFoodItems();
  }

  submitQuestionnaire() {
    let pageHasErrors = false;
    for (const foodItem of this.foodItems) {
      if (this.hideSecondaryItems && !foodItem.isPrimary) {
        foodItem.disabled = true;
      }
      if (!foodItem.disabled) {
        foodItem.isSubmitted = true;
        if (foodItem.getErrorState().length > 0) {
          pageHasErrors = true;
        }
      }
    }

    if (pageHasErrors) {
      log('Errors on page. Questionnaire incomplete.');
      const  dialogRef  = this.submissionErrorDialog.open(ErrorDialogPopupComponent);
      dialogRef.componentInstance.title = 'Questionnaire Incomplete';
      dialogRef.componentInstance.message = 'Please ensure all required fields are completed.';
    } else {
      log('Questionnaire submitted successfully.');
      const itemList: FFQItemCalcRequest[] = [];
      for (const fooditem of this.foodItems) {
        if (!fooditem.disabled) {
          const request = FFQItemCalcRequest.calcRequestFromFoodItem(fooditem);
          console.log(request.toString());
          itemList.push(request);
        }
      }
     
      this.foodService.calculateNutrientBreakdown(this.id,itemList)
        .subscribe( (results) => {
            console.log(results);
            const dailyMap: Map<string, number> = new Map();
            const weeklyMap: Map<string, number> = new Map();
            for (const nutrient of NutrientConstants.NUTRIENT_NAMES) {
              const dailyValue = results.dailyAverages[nutrient];
              const weeklyValue = results.weeklyTotals[nutrient];
              if (dailyValue !== null && dailyValue !== undefined
                && weeklyValue !== null && weeklyValue !== undefined) {
                console.log('Nutrient: ' + nutrient + ', Daily Value: ' + dailyValue);
                dailyMap.set(nutrient, dailyValue);
                console.log('Nutrient: ' + nutrient + ', Weekly Value: ' + weeklyValue);
                weeklyMap.set(nutrient, weeklyValue);
              }
            }
            const ffqResult = new FFQResult(dailyMap, weeklyMap);

            const modalRef = this.modalService.open(ResultsPageComponent);
            modalRef.componentInstance.results = ffqResult;
            console.log('OPENED MODAL');

            this.questService.submitQuestionnaire(this.questionnaire.id).subscribe((data: Questionnaire) => {
            this.router.navigateByUrl('/');
            const dialogRef = this.successDialog.open(ErrorDialogPopupComponent);
            dialogRef.componentInstance.title = 'Submitted Successfully';
            dialogRef.componentInstance.message = 'The questionnaire has been sent to the issuer.';
            }, (error: HttpErrorResponse) => this.handleSubmissionError(error));

        }, (error: HttpErrorResponse) => this.handleSubmissionError(error));

    }
  }

  public toggleHideSecondaryItems() {
      this.hideSecondaryItems = !this.hideSecondaryItems;
  }

  private loadFoodItems() {
    this.foodService.getFoodItems().subscribe(data => {
      data.map(response => {
        this.foodItems.push(FFQItem.foodItemFromResponse(response));
      });
      console.log(this.foodItems.length + ' food items returned from server.');
      this.dataLoaded = Promise.resolve(true);
    }, (error: HttpErrorResponse) => this.handleFoodServiceError(error));
  }

  private handleFoodServiceError(error: HttpErrorResponse) {
    console.error('Error occurred.\n' + error.message);
    const dialogRef = this.errorDialog.open(ErrorDialogPopupComponent);
    dialogRef.componentInstance.title = 'Error Fetching Food Items';
    dialogRef.componentInstance.message = error.message;
    dialogRef.componentInstance.router = this.router;
    dialogRef.afterClosed().subscribe(() => {
      this.router.navigateByUrl('/');
    });
  }

  private handleQuestionnaireError(error: Error) {
    this.router.navigateByUrl('/');
    console.error('Error occurred: ' + error.message);
    const dialogRef = this.errorDialog.open(ErrorDialogPopupComponent);
    dialogRef.componentInstance.title = 'Error Validating Id';
    dialogRef.componentInstance.message = error.message;
  }

  private handleSubmissionError(error: Error) {
    this.router.navigateByUrl('/');
    console.error('Error occurred: ' + error.message);
    const dialogRef = this.errorDialog.open(ErrorDialogPopupComponent);
    dialogRef.componentInstance.title = 'Error Submitting Questionnaire';
    dialogRef.componentInstance.message = error.message + '. Try again or contact administrator.';
  }
}
