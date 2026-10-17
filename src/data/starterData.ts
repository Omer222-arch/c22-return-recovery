
import fixture from "../../fixture.json";

export interface Lot {
  lot_id: string;
  units: number | null;
  inspection: string | null;
  refurbishment_inr: number | null;
  handling_inr: number | null;
  resale_price_inr: number | null;
  scrap_recovery_inr: number | null;
}

export interface RecoverIQFixture {
  case_id: string;
  synthetic: boolean;
  data_version: string;
  currency: string;
  missing_values: string;
  records: {
    lots: Lot[];
    expected_per_unit_recovery_inr: number | null;
    notes: string;
    worked_example: {
      units: number;
      resale_inr: number;
      refurbishment_inr: number;
      handling_inr: number;
      scrap_inr: number;
      expected_refurb_net_inr: number;
      expected_scrap_inr: number;
    };
  };
  public_checks: string[];
  limit: string;
}

export const starterData = fixture as RecoverIQFixture;

export const starterLots = starterData.records.lots;
