"use client";

type IntroductionSortProps = {
  activeSort: "newest" | "oldest";
  activeStatus: "all" | "pending" | "replied";
};

export default function IntroductionSort({ activeSort, activeStatus }: IntroductionSortProps) {
  return (
    <form method="get" className="flex items-center gap-2 text-sm text-black/55">
      {activeStatus !== "all" && <input type="hidden" name="status" value={activeStatus} />}
      <label htmlFor="introduction-sort" className="sr-only">Sort introductions</label>
      <select
        id="introduction-sort"
        name="sort"
        defaultValue={activeSort}
        className="field min-h-10 w-auto rounded-full border-0 bg-transparent py-2 pl-3 pr-8 text-sm font-medium text-black/60 focus-visible:ring-2 focus-visible:ring-[#087456]"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
      <span aria-hidden="true" className="text-lg text-primary">≡</span>
    </form>
  );
}
