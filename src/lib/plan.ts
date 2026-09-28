/**
 * Реестр тарифов.
 *
 * Держим текстовое описание рядом с фактическими лимитами (billing/plan.ts):
 * страница тарифов врёт ровно тогда, когда эти два места разъезжаются.
 * Цены — в копейках, валюта одна (USD), как и в настройках Stripe.
 */
export type PlanId = "FREE" | "STARTER" | "TEAM";

export type PlanFeature = { label: string; included: boolean };

export type PlanDefinition = {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  highlight: boolean;
  cta: string;
  features: PlanFeature[];
};

export const PLANS: PlanDefinition[] = [
  {
    id: "FREE",
    name: "Free",
    tagline: "Пока вы работаете один",
    priceMonthly: 0,
    priceYearly: 0,
    highlight: false,
    cta: "Текущий тариф",
    features: [
      { label: "3 места в команде", included: true },
      { label: "5 проектов", included: true },
      { label: "10 клиентов", included: true },
      { label: "3 счёта в месяц", included: true },
      { label: "Экспорт счетов в PDF", included: false },
      { label: "Выгрузка данных", included: false },
    ],
  },
  {
    id: "STARTER",
    name: "Starter",
    tagline: "Фриланс с первым подрядчиком",
    priceMonthly: 1500,
    priceYearly: 15000,
    highlight: true,
    cta: "Выбрать Starter",
    features: [
      { label: "5 мест в команде", included: true },
      { label: "25 проектов", included: true },
      { label: "100 клиентов", included: true },
      { label: "50 счетов в месяц", included: true },
      { label: "Экспорт счетов в PDF", included: true },
      { label: "Выгрузка данных", included: false },
    ],
  },
  {
    id: "TEAM",
    name: "Team",
    tagline: "Студия с постоянными клиентами",
    priceMonthly: 4900,
    priceYearly: 49000,
    highlight: false,
    cta: "Выбрать Team",
    features: [
      { label: "25 мест в команде", included: true },
      { label: "200 проектов", included: true },
      { label: "1000 клиентов", included: true },
      { label: "500 счетов в месяц", included: true },
      { label: "Экспорт счетов в PDF", included: true },
      { label: "Выгрузка данных", included: true },
    ],
  },
];

export const YEARLY_DISCOUNT_LABEL = "−17% при оплате за год";

export function findPlan(id: string | null | undefined): PlanDefinition {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}
